const express = require("express");
const nodemailer = require("nodemailer");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads");
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Only accept PDF files
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
});

// Create a transporter using Gmail SMTP
const createTransporter = (senderEmail, appPassword) => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: senderEmail,
      pass: appPassword,
    },
  });
};

// Email sending route
app.post("/send-emails", upload.single("resume"), async (req, res) => {
  try {
    const {
      senderEmail,
      appPassword,
      emails,
      batchSize = 70,
      name,
      phoneNumber,
      website,
      degree,
      customMessage,
    } = req.body;

    // Validate inputs
    if (!senderEmail || !appPassword || !emails) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Process email list
    const emailList = emails
      .split(",")
      .map((email) => email.trim())
      .filter((email) => email);

    // Validate resume file
    if (!req.file) {
      return res.status(400).json({ error: "Resume PDF is required" });
    }

    // Create transporter
    const transporter = createTransporter(senderEmail, appPassword);

    // Results tracking
    const results = {
      total: emailList.length,
      sent: 0,
      failed: 0,
      sentEmails: [],
    };

    // Function to send individual email
    const sendEmail = async (email) => {
      try {
        const mailOptions = {
          from: senderEmail,
          to: email,
          subject: degree,
          html: `
            <html>
            <body>
              ${customMessage}
              <p>Cordialement,<br> 
                ${name} <br> 
                ${phoneNumber} <br> 
                ${website} 
              </p>
            </body>
            </html>
          `,
          attachments: [
            {
              filename: req.file.originalname,
              path: req.file.path,
            },
          ],
        };

        await transporter.sendMail(mailOptions);
        results.sent++;
        results.sentEmails.push(email);
        return true;
      } catch (error) {
        console.error(`Error sending to ${email}:`, error);
        results.failed++;
        return false;
      }
    };

    // Send emails in batches
    for (let i = 0; i < emailList.length; i += batchSize) {
      const batch = emailList.slice(i, i + batchSize);

      // Send batch of emails
      await Promise.all(batch.map(sendEmail));

      // Random delay between batches (3-5 minutes)
      if (i + batchSize < emailList.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 120000 + 180000)
        );
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    // Return results
    res.status(200).json(results);
  } catch (error) {
    console.error("Email sending error:", error);
    res
      .status(500)
      .json({ error: "Failed to send emails", details: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
