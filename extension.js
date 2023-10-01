const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const { exec } = require('child_process');
const { Deepgram } = require('@deepgram/sdk');
const dotenv = require('dotenv'); // Import dotenv package

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3000;

app.use(cors());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedFileTypes = ['video/mp4', 'video/webm'];

    if (allowedFileTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4 and WebM video files are allowed.'), false);
    }
  },
});

app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const videoFilePath = `uploads/${req.file.filename}`;
    const audioFilePath = `uploads/${req.file.filename.replace(/\.[^/.]+$/, '.wav')}`;

    exec(`ffmpeg -i ${videoFilePath} -acodec pcm_s16le -ac 2 -ar 44100 ${audioFilePath}`, (error) => {
      if (error) {
        console.error('FFmpeg Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }

      // Load Deepgram API key from .env file
      const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

      // Initialize Deepgram client
      const deepgram = new Deepgram(deepgramApiKey);

      const audioData = fs.readFileSync(audioFilePath);
      deepgram.transcribe(audioData, {
        model: 'general',
      })
      .then((transcription) => {
        const responseObj = {
          video: {
            filename: req.file.filename,
            url: `/video/${req.file.filename}`,
          },
          audio: {
            filename: audioFilePath,
            transcription: transcription || 'Transcription not available',
          },
        };

        res.json(responseObj);
      })
      .catch((deepgramError) => {
        console.error('Deepgram Error:', deepgramError);
        res.status(500).json({ error: 'Internal server error' });
      });
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Rest of your code for serving video files and transcript retrieval

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
