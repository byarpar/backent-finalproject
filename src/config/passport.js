const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const userRepository = require('../repositories/UserRepository');
const logger = require('../utils/logger');

const sanitizeUsername = (value) => (value || '')
  .toString()
  .toLowerCase()
  .replace(/[^a-z0-9_]/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 28);

const generateUniqueUsername = async ({ email, givenName, familyName, displayName }) => {
  const emailPrefix = (email || '').split('@')[0];
  const fullNameCandidate = [givenName, familyName].filter(Boolean).join('_');
  const base = sanitizeUsername(fullNameCandidate || displayName || emailPrefix || 'user') || 'user';

  const primaryExists = await userRepository.findByUsername(base);
  if (!primaryExists) return base;

  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = `${base}_${attempt}`.slice(0, 32);
    const exists = await userRepository.findByUsername(candidate);
    if (!exists) return candidate;
  }

  return `${base}_${crypto.randomBytes(3).toString('hex')}`.slice(0, 32);
};

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await userRepository.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Only configure Google OAuth if credentials are provided
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  // Google OAuth Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'https://finalproject-backend.lisudictionar.com/api/auth/google/callback',
        passReqToCallback: true,
        proxy: true
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const oauthIntent = req.query?.state === 'register' ? 'register' : 'login';

          logger.info('Google OAuth callback received', {
            profileId: profile.id,
            email: profile.emails[0]?.value,
            intent: oauthIntent
          });

          // Extract user information from Google profile
          const googleId = profile.id;
          const email = profile.emails[0]?.value;
          const fullName = profile.displayName;
          const profilePhoto = profile.photos[0]?.value;
          const givenName = profile.name?.givenName;
          const familyName = profile.name?.familyName;

          if (!email) {
            return done(new Error('No email found in Google profile'), null);
          }

          // Check if this Google account was deleted
          const deletedGoogleUser = await userRepository.findDeletedByGoogleId(googleId);
          if (deletedGoogleUser) {
            const GRACE_PERIOD_DAYS = 30;
            const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
            const deletedDate = new Date(deletedGoogleUser.deleted_at);
            const now = new Date();
            const canRestore = (now - deletedDate) <= GRACE_PERIOD_MS && deletedGoogleUser.account_status !== 'anonymized';

            logger.warn('Deleted Google account attempted login', {
              googleId,
              email: deletedGoogleUser.email,
              deletedAt: deletedGoogleUser.deleted_at,
              canRestore
            });

            const error = new Error(
              canRestore
                ? 'This account has been deleted. You can restore it within 30 days of deletion.'
                : 'This account has been permanently deleted. If you wish to use this service again, please create a new account.'
            );
            error.accountDeleted = true;
            error.canRestore = canRestore;
            error.email = deletedGoogleUser.email;
            return done(error, null);
          }

          // Check if this email was deleted (from regular account)
          const deletedEmailUser = await userRepository.findDeletedByEmail(email);
          if (deletedEmailUser) {
            const GRACE_PERIOD_DAYS = 30;
            const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
            const deletedDate = new Date(deletedEmailUser.deleted_at);
            const now = new Date();
            const canRestore = (now - deletedDate) <= GRACE_PERIOD_MS && deletedEmailUser.account_status !== 'anonymized';

            logger.warn('Deleted email account attempted Google login', {
              email: deletedEmailUser.email,
              deletedAt: deletedEmailUser.deleted_at,
              canRestore
            });

            const error = new Error(
              canRestore
                ? 'This account has been deleted. You can restore it within 30 days of deletion.'
                : 'This account has been permanently deleted. If you wish to use this service again, please create a new account.'
            );
            error.accountDeleted = true;
            error.canRestore = canRestore;
            error.email = deletedEmailUser.email;
            return done(error, null);
          }

          // Check if user exists with this Google ID
          let user = await userRepository.findByGoogleId(googleId);

          if (user) {
            // User exists with this Google ID
            // Only update profile photo if user doesn't have one (or it's still the Google default)
            const shouldUpdatePhoto = !user.profile_photo_url ||
              user.profile_photo_url.includes('googleusercontent.com');

            if (shouldUpdatePhoto && profilePhoto && user.profile_photo_url !== profilePhoto) {
              user = await userRepository.update(user.id, {
                profile_photo_url: profilePhoto,
                last_login: new Date()
              });
            } else {
              // Just update last login, keep existing profile photo
              await userRepository.update(user.id, { last_login: new Date() });
            }

            logger.info('Existing Google user logged in', {
              userId: user.id,
              email: user.email
            });

            return done(null, user);
          }

          // Check if user exists with this email (from regular registration)
          user = await userRepository.findByEmail(email);

          if (user) {
            // User exists with email - link Google account
            // Only use Google photo if user doesn't have a profile photo yet
            const updatedProfilePhoto = user.profile_photo_url || profilePhoto;

            user = await userRepository.update(user.id, {
              google_id: googleId,
              oauth_provider: 'google',
              profile_photo_url: updatedProfilePhoto,
              email_verified: true, // Google emails are verified
              last_login: new Date()
            });

            logger.info('Linked existing email account with Google', {
              userId: user.id,
              email: user.email,
              keptExistingPhoto: !!user.profile_photo_url
            });

            return done(null, user);
          }

          if (oauthIntent === 'register') {
            const username = await generateUniqueUsername({
              email,
              givenName,
              familyName,
              displayName: fullName
            });

            const internalPassword = crypto.randomBytes(24).toString('hex');

            user = await userRepository.create({
              email,
              password: internalPassword,
              username,
              full_name: fullName || [givenName, familyName].filter(Boolean).join(' ') || username,
              google_id: googleId,
              oauth_provider: 'google',
              profile_photo_url: profilePhoto,
              email_verified: true
            });

            await userRepository.update(user.id, { last_login: new Date() });

            logger.info('Created new user via Google OAuth registration', {
              userId: user.id,
              email: user.email,
              username: user.username
            });

            return done(null, user);
          }

          logger.warn('Google OAuth denied for unregistered user', {
            email,
            googleId,
            intent: oauthIntent
          });

          const error = new Error('No account found. Please register first, then login with Google.');
          error.accountNotFound = true;
          error.email = email;
          return done(error, null);

        } catch (error) {
          logger.error('Google OAuth error:', {
            error: error.message,
            stack: error.stack
          });
          done(error, null);
        }
      }
    )
  );

  logger.info('Google OAuth configured successfully');
} else {
  logger.warn('Google OAuth not configured - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not found in environment variables');
}

module.exports = passport;
