import express from 'express';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

import User from '../models/User';

import logger from '../utils/logger';

const router = express.Router();
router.use(express.json());

router.post('/login', async (req, res) => {
  const { code } = req.body;
  if (typeof code !== 'string') {
    res.status(400).json({ error: 'Invalid code' });
    return;
  }

  if (code === 'mock') {
    let { user_id, access_token } = req.body;
    if (typeof user_id !== 'string' || typeof access_token !== 'string') {
      res.status(400).json({ error: 'Invalid parameters' });
    }

    if (!(await User.exists({ userId: user_id, accessToken: access_token, secure: false }))) {
      user_id = uuidv4();
      access_token = uuidv4();
      await User.create({ userId: user_id, accessToken: access_token, secure: false });
    }

    res.status(200).json({ user_id, access_token });
    return;
  }

  try {
    const access_token = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: process.env.DISCORD_APPLICATION_ID,
        client_secret: process.env.DISCORD_APPLICATION_SECRET,
        grant_type: 'authorization_code',
        code
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error('Failed to exchange code for token');
      }
      return ((await response.json()) as { access_token: string }).access_token;
    });

    const userid = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error('Failed to fetch user information');
      }
      return ((await response.json()) as { id: string }).id;
    });

    await User.findOneAndUpdate(
      { userId: userid },
      { userId: userid, accessToken: access_token, secure: true },
      { upsert: true }
    );

    res.status(200).json({ access_token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to authenticate' });
    logger.error(error);
  }
});

export default router;
