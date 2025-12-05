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
3. **AI Voice**: OpenAI TTS generates natural voice reminder
4. **Patient Response**: Patient says YES/NO after beep
5. **Transcription**: OpenAI Whisper transcribes response
6. **Analysis**: GPT-3.5-turbo analyzes if patient will attend
7. **Storage**: Response saved to MongoDB
8. **Dashboard**: View all call history and responses

## 📝 License

MIT

## 👥 Author

Sabareeswaran070

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
