const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const { formatResponse, formatError } = require('../utils/helpers');

class AuthController {
  // Register new user
  static async register(req, res) {
    try {
      const { email, password, username, full_name, role = 'user' } = req.body;

      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(409).json(formatError(
          'User already exists',
          'An account with this email already exists'
        ));
      }

      // Check if username already exists (if provided)
      if (username) {
        const existingUsername = await User.findByUsername(username);
        if (existingUsername) {
          return res.status(409).json(formatError(
            'Username already exists',
            'This username is already taken'
          ));
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await User.create({
        email,
        password: hashedPassword,
        username,
        full_name,
        role
      });

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email, 
          username: user.username,
          full_name: user.full_name,
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      logger.info('User registered successfully', {
        userId: user.id,
        email: user.email,
        role: user.role
      });

      res.status(201).json(formatResponse(true, {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          created_at: user.created_at
        }
      }, 'Registration successful'));

    } catch (error) {
      logger.error('Registration failed:', { error: error.message });
      res.status(500).json(formatError('Registration failed', error.message));
    }
  }

  // Login user
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(401).json(formatError(
          'Invalid credentials',
          'Email or password is incorrect'
        ));
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(401).json(formatError(
          'Account deactivated',
          'Your account has been deactivated'
        ));
      }

      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json(formatError(
          'Invalid credentials',
          'Email or password is incorrect'
        ));
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email, 
          username: user.username,
          full_name: user.full_name,
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      // Update last_login timestamp
      await User.update(user.id, { last_login: new Date() });

      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
        ip: req.ip
      });

      res.json(formatResponse(true, {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          role: user.role
        }
      }, 'Login successful'));

    } catch (error) {
      logger.error('Login failed:', { error: error.message });
      res.status(500).json(formatError('Login failed', error.message));
    }
  }

  // Verify token
  static async verifyToken(req, res) {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json(formatError('User not found'));
      }

      res.json(formatResponse(true, {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          is_active: user.is_active
        }
      }, 'Token verified'));

    } catch (error) {
      logger.error('Token verification failed:', { error: error.message });
      res.status(500).json(formatError('Token verification failed', error.message));
    }
  }

  // Get user profile
  static async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json(formatError('User not found'));
      }

      res.json(formatResponse(true, {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          bio: user.bio,
          location: user.location,
          native_language: user.native_language,
          role: user.role,
          is_active: user.is_active,
          last_login: user.last_login,
          profile_photo_url: user.profile_photo_url,
          dark_mode_preference: user.dark_mode_preference,
          created_at: user.created_at,
          updated_at: user.updated_at
        }
      }));

    } catch (error) {
      logger.error('Get profile failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get profile', error.message));
    }
  }

  // Update profile
  static async updateProfile(req, res) {
    try {
      const { email, username, full_name, bio, location, native_language, profile_photo_url, dark_mode_preference } = req.body;
      const userId = req.user.id;

      // Check if email is being changed and already exists
      if (email && email !== req.user.email) {
        const existingUser = await User.findByEmail(email);
        if (existingUser && existingUser.id !== userId) {
          return res.status(409).json(formatError(
            'Email already exists',
            'Another user is already using this email'
          ));
        }
      }

      // Check if username is being changed and already exists
      if (username && username !== req.user.username) {
        const existingUsername = await User.findByUsername(username);
        if (existingUsername && existingUsername.id !== userId) {
          return res.status(409).json(formatError(
            'Username already exists',
            'This username is already taken'
          ));
        }
      }

      // Prepare update data - only include fields that are provided
      const updateData = {};
      if (email !== undefined) updateData.email = email;
      if (username !== undefined) updateData.username = username;
      if (full_name !== undefined) updateData.full_name = full_name;
      if (bio !== undefined) updateData.bio = bio;
      if (location !== undefined) updateData.location = location;
      if (native_language !== undefined) updateData.native_language = native_language;
      if (profile_photo_url !== undefined) updateData.profile_photo_url = profile_photo_url;
      if (dark_mode_preference !== undefined) updateData.dark_mode_preference = dark_mode_preference;

      const updatedUser = await User.update(userId, updateData);
      if (!updatedUser) {
        return res.status(404).json(formatError('User not found'));
      }

      logger.info('Profile updated successfully', {
        userId: updatedUser.id,
        email: updatedUser.email,
        fieldsUpdated: Object.keys(updateData)
      });

      res.json(formatResponse(true, {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          username: updatedUser.username,
          full_name: updatedUser.full_name,
          bio: updatedUser.bio,
          location: updatedUser.location,
          native_language: updatedUser.native_language,
          role: updatedUser.role,
          is_active: updatedUser.is_active,
          last_login: updatedUser.last_login,
          profile_photo_url: updatedUser.profile_photo_url,
          updated_at: updatedUser.updated_at
        }
      }, 'Profile updated successfully'));

    } catch (error) {
      logger.error('Update profile failed:', { error: error.message });
      res.status(500).json(formatError('Failed to update profile', error.message));
    }
  }

  // Change password
  static async changePassword(req, res) {
    try {
      const {
        currentPassword,
        newPassword,
        current_password,
        new_password
      } = req.body;

      // Support both naming conventions
      const currentPass = currentPassword || current_password;
      const newPass = newPassword || new_password;

      logger.info('Change password request:', {
        userId: req.user.id,
        email: req.user.email,
        hasCurrentPass: !!currentPass,
        hasNewPass: !!newPass,
        body: Object.keys(req.body)
      });

      if (!currentPass || !newPass) {
        return res.status(400).json(formatError(
          'Missing required fields',
          'Both current password and new password are required'
        ));
      }

      const userId = req.user.id;

      // Get user with password
      logger.info('Looking up user by email:', req.user.email);
      const user = await User.findByEmail(req.user.email);

      logger.info('User lookup result:', {
        found: !!user,
        hasPassword: !!(user && user.password),
        userKeys: user ? Object.keys(user) : []
      });

      if (!user) {
        return res.status(404).json(formatError('User not found'));
      }

      // Debug: Check if password exists
      if (!user.password) {
        logger.error('Password field missing for user:', { userId: req.user.id, email: req.user.email });
        return res.status(500).json(formatError('Password data not found', 'Unable to verify current password'));
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPass, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json(formatError(
          'Invalid current password',
          'The current password you entered is incorrect'
        ));
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPass, 12);

      // Update password
      await User.update(userId, { password: hashedNewPassword });

      logger.info('Password changed successfully', { userId });

      res.json(formatResponse(true, null, 'Password changed successfully'));

    } catch (error) {
      logger.error('Change password failed:', { error: error.message });
      res.status(500).json(formatError('Failed to change password', error.message));
    }
  }

  // Update dark mode preference
  static async updateDarkModePreference(req, res) {
    try {
      const { dark_mode_preference } = req.body;
      const userId = req.user.id;

      if (typeof dark_mode_preference !== 'boolean') {
        return res.status(400).json(formatError(
          'Invalid input',
          'dark_mode_preference must be a boolean value'
        ));
      }

      const updatedUser = await User.update(userId, { dark_mode_preference });
      if (!updatedUser) {
        return res.status(404).json(formatError('User not found'));
      }

      logger.info('Dark mode preference updated', {
        userId: updatedUser.id,
        dark_mode_preference
      });

      res.json(formatResponse(true, {
        dark_mode_preference: updatedUser.dark_mode_preference
      }, 'Dark mode preference updated successfully'));

    } catch (error) {
      logger.error('Update dark mode preference failed:', { error: error.message });
      res.status(500).json(formatError('Failed to update dark mode preference', error.message));
    }
  }
}

module.exports = AuthController;
