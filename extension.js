const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Bull = require('bull');
const fs = require('fs');
const { exec } = require('child_process');
const { Deepgram } = require('@deepgram/sdk');
const ffmpeg = require('fluent-ffmpeg');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Initialize the queue for audio processing
const audioQueue = new Bull('audioQueue');

// Handle incoming video Blobs
app.post('/uploadBlob', upload.single('videoBlob'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Blob uploaded' });
    }

    const blobBuffer = req.file.buffer;
    const blobFileName = `${Date.now()}_blob.webm`;
    const blobFilePath = `uploads/${blobFileName}`;

    // Save the Blob to a file
    fs.writeFileSync(blobFilePath, blobBuffer);

    // Add the Blob to the audioQueue for further processing
    audioQueue.add({ blobFilePath });

    res.json({ success: true });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process audio from Blobs in the queue
audioQueue.process(async (job) => {
  const { blobFilePath } = job.data;

  try {
    // Transcribe the audio using Deepgram API
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    const deepgram = new Deepgram(deepgramApiKey);

    const audioData = fs.readFileSync(blobFilePath);
    const transcription = await deepgram.transcribe(audioData, { model: 'general' });

    // Save the transcription
    fs.writeFileSync(blobFilePath.replace('.webm', '.txt'), transcription);

    // Combine the Blob with previously processed Blobs (if any)
    // Implement logic for combining audio and video here
    // For example, use 'fluent-ffmpeg' to combine audio and video

    const combinedFileName = blobFilePath.replace('.webm', '_combined.mp4');
    const ffmpegCommand = ffmpeg()
      .input(blobFilePath)
      .inputOptions(['-framerate 30']) // Set frame rate if needed
      .input(blobFilePath.replace('.webm', '.wav'))
      .outputOptions(['-c:v libx264', '-c:a aac'])
      .output(combinedFileName)
      .on('end', () => {
        console.log('Video combining finished.');
        // Cleanup temporary files
        fs.unlinkSync(blobFilePath);
        fs.unlinkSync(blobFilePath.replace('.webm', '.wav'));
      });

    ffmpegCommand.run();
  } catch (error) {
    console.error('Error processing Blob:', error);
    // Handle error, log it, or retry the job as needed
  }
});

// Serve the combined video, audio, and transcript for streaming or download
app.get('/combined/:videoId', (req, res) => {
  const videoId = req.params.videoId;
  const combinedFilePath = `uploads/${videoId}_combined.mp4`;
  const transcriptionFilePath = `uploads/${videoId}.txt`;

  // Implement logic to serve the combined video, audio, and transcript here
  // For streaming, you can use video streaming libraries like 'fluent-ffmpeg' or 'express-ws'

  // For example, send the combined video for streaming
  const stat = fs.statSync(combinedFilePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    const chunkSize = end - start + 1;
    const file = fs.createReadStream(combinedFilePath, { start, end });
    const headers = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    };

    res.writeHead(206, headers);
    file.pipe(res);
  } else {
    const headers = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, headers);
    fs.createReadStream(combinedFilePath).pipe(res);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
