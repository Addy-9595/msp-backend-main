// Require necessary modules
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const aws = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
require('dotenv').config();

// Initialize AWS SDK
aws.config.update({ region: process.env.AWS_REGION });
const dynamodb = new aws.DynamoDB.DocumentClient();
const S3 = new aws.S3();

// Create an Express app
const app = express();
const port = 3001;

// Configure middleware
app.use(bodyParser.json());
app.use(cors());

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Route for uploading media files
app.post('/upload', upload.single('file'), (req, res) => {
 
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const key = `${uuidv4()}-${file.originalname}`;

  // call S3 to retrieve upload file to specified bucket
  let uploadParams = {
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: ""
  };

  // Configure the file stream and obtain the upload parameters
  const fs= require("fs");
  let fileStream = fs.createReadStream(file.path);
  fileStream.on("error", function (err) {
    console.log("File Error", err);
  });
  uploadParams.Body = fileStream;

  // call S3 to retrieve upload file to specified bucket
  S3.upload(uploadParams, function (err, data) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to upload file' });
    }
    if (data) {
      // Save metadata to DynamoDB
      const metadata = {
        fileId: uuidv4(),
        filename: file.originalname,
        key: key,
        url: data.Location
      };

      const dynamoParams = {
        TableName: process.env.DYNAMO_TABLE,
        Item: metadata
      };

      dynamodb.put(dynamoParams, (err, data) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Failed to save metadata' });
        }
        res.json(metadata);
      });
    }
  });
});

// Route for fetching media files and metadata
app.get('/media/:fileId', (req, res) => {
  const fileId = req.params.fileId;

  // Retrieve metadata from DynamoDB
  const dynamoParams = {
    TableName: 'mediatable9595',
    Key: {
      fileId: fileId
    }
  };



  dynamodb.get(dynamoParams, (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve metadata' });
    }

    if (!data.Item) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Redirect to the S3 URL
    res.redirect(data.Item.url);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

