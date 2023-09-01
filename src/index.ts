// src/app.ts

import express, { Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import csvParser from "csv-parser";
import { createObjectCsvWriter } from "csv-writer";
import path from "path";

// Initialize
const app = express();
const port = 3000;

// Setup Multer
const upload = multer({ dest: "uploads/" });

// Utility function to chunk array
const chunkArray = (array: any[], size: number): any[][] => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

// CSV Writer
const csvWriter = createObjectCsvWriter({
  path: "out.csv",
  header: [
    { id: "name", title: "NAME" },
    // Add other field headers that you expect in your CSV
  ],
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return;
  const filePath = req.file.path;
  const readStream = fs.createReadStream(filePath);

  let rows: any[] = [];

  readStream
    .pipe(csvParser())
    .on("data", (row) => {
      rows.push(row);
    })
    .on("end", async () => {
      const chunkedRows = chunkArray(rows, 50);

      const processedData: any[] = [];

      // Process each chunk (Here, converting the 'name' to uppercase)
      chunkedRows.forEach((chunk) => {
        const processedChunk = chunk.map((row: any) => {
          row.name = row.name;
          return row;
        });

        processedData.push(...processedChunk);
      });

      // Write the processed data to a new CSV
      await csvWriter.writeRecords(processedData);

      const filePath = "out.csv";
      res.download(filePath);
    });
});

app.get("/download", (req, res) => {
  const filePath = "out.csv";
  res.download(filePath);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
