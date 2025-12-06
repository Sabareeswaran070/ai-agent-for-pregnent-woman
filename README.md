# AI Voice Agent for Pregnant Women

An AI-powered voice agent system that makes automated calls to pregnant women to remind them about their upcoming medical tests and appointments. The system uses OpenAI's TTS for natural voice generation, Whisper for transcription, and GPT for response analysis.

## 🚀 Features

- **Automated Voice Calls**: Makes calls via Twilio to remind patients about appointments
- **AI Voice Generation**: Uses OpenAI TTS (text-to-speech) for natural-sounding reminders
- **Voice Response Processing**: Records and transcribes patient responses using OpenAI Whisper
- **AI Analysis**: Analyzes responses using GPT-3.5-turbo to determine if patient will attend
- **Patient Management**: Dashboard to manage patient records and upcoming tests
- **Call History**: Track all calls and patient responses
- **MongoDB Storage**: Persistent storage for patient data and call records

## 📋 Prerequisites

- Node.js (v18 or higher)
- MongoDB Atlas account
- Twilio account with phone number
- OpenAI API key
- ngrok (for local development)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd "AI Voice agent for pregnent women"
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Configure environment variables**
   
   Create a `.env` file in the `backend` folder with the following:
   ```env
   # Twilio Configuration
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_PHONE=your_twilio_phone_number

   # OpenAI Configuration
   OPENAI_API_KEY=your_openai_api_key

   # MongoDB Configuration
   MONGO_URI=your_mongodb_connection_string

   # Server Configuration
   BASE_URL=your_ngrok_url
   PORT=5000
   ```

## 🚀 Running the Project

### Option 1: Run Everything Separately (Recommended)

**Terminal 1 - Backend Server:**
```bash
cd backend
npm start
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
```

**Terminal 3 - ngrok:**
```bash
ngrok http 5000
```
Copy the HTTPS URL from ngrok and update `BASE_URL` in your `.env` file.

### Option 2: Quick Access

- **Frontend Dashboard**: http://localhost:3000
- **Backend API**: http://localhost:5000

## 📱 Making Test Calls

Use the frontend dashboard or run the PowerShell script:
```powershell
.\make-real-call.ps1
```

Or use the API directly:
```powershell
Invoke-RestMethod -Method Post -Uri 'http://localhost:5000/call' -Body '{"phone":"+1234567890","customMessage":"Your reminder message"}' -ContentType 'application/json'
```

## 📊 API Endpoints

- `POST /call` - Trigger a call to a patient
- `GET /patients` - Get all patients
- `POST /patients` - Create a new patient
- `GET /call-history` - Get all call history
- `POST /voice` - Twilio webhook for voice calls
- `POST /process-recording` - Process patient response recordings

## 🏗️ Project Structure

```
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── aiController.js      # OpenAI integration
│   │   │   └── voiceController.js   # Twilio voice handling
│   │   ├── models/
│   │   │   ├── Patient.js           # Patient schema
│   │   │   └── CallResponse.js      # Call history schema
│   │   └── server.js                # Express server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── NavBar.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── CallPage.jsx
│   │   │   └── CallHistory.jsx
│   │   └── App.js
│   └── package.json
└── README.md
```

## 🔧 Technologies Used

- **Backend**: Node.js, Express.js
- **Frontend**: React.js
- **Database**: MongoDB Atlas
- **AI Services**: OpenAI (TTS, Whisper, GPT-3.5-turbo)
- **Telephony**: Twilio Voice API
- **Tunneling**: ngrok (for local development)

## 🎯 How It Works

1. **Patient Record**: Add patient details including upcoming tests
2. **Trigger Call**: System makes automated call via Twilio
3. **AI Voice**: Twilio TTS generates natural voice reminder
4. **Patient Response**: Patient presses **1 to confirm** or **2 to decline** attendance
5. **Instant Analysis**: System immediately processes keypress response
6. **Storage**: Response saved to MongoDB with confirmation status
7. **Dashboard**: View all call history and responses

### Keypress Options:
- Press **1**: Confirmed - Patient will attend the appointment
- Press **2**: Rejected - Patient cannot attend the appointment
- No response or other keys: Marked as unclear

## 🐛 Troubleshooting

### "Application Error" when clicking Confirm/Initiate Call

**Problem**: When you click the "Initiate Call" button in the dashboard, you get an "Application Error" or "Server configuration error".

**Solution**: This usually means the `BASE_URL` environment variable is not set in your `.env` file.

1. Make sure you have ngrok running:
   ```bash
   ngrok http 5000
   ```

2. Copy the HTTPS URL from ngrok (e.g., `https://abc123.ngrok.io`)

3. Update your `backend/.env` file:
   ```env
   BASE_URL=https://abc123.ngrok.io
   ```
   **Important**: Do NOT include a trailing slash!

4. Restart your backend server:
   ```bash
   cd backend
   npm start
   ```

### Other Common Issues

**Issue**: "Cannot connect to server"
- **Solution**: Ensure the backend is running on `http://localhost:5000`

**Issue**: "Invalid phone number"
- **Solution**: Make sure phone numbers are in international format (e.g., `+1234567890` or `+911234567890`)

**Issue**: "MongoDB connection error"
- **Solution**: Check your `MONGO_URI` in the `.env` file and ensure your IP is whitelisted in MongoDB Atlas

**Issue**: "Twilio authentication error"
- **Solution**: Verify your `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE` in the `.env` file

## 📝 License

MIT

## 👥 Author

Sabareeswaran070

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
