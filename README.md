1. **Install packages:**
   ```bash
   cd backend
   npm install
   cd ../frontend
   npm install
   ```

2. **Create `.env` file in backend folder:**
   ```env
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE=your_phone_number
   OPENAI_API_KEY=your_api_key
   MONGO_URI=your_mongodb_uri
   BASE_URL=your_ngrok_url
   PORT=5000
   ```

## Run

Open 3 terminals and run:

```bash
# Terminal 1
cd backend
npm start

# Terminal 2
cd frontend
npm start

# Terminal 3
ngrok http 5000
```

Copy ngrok URL to `BASE_URL` in `.env` and restart backend.

## Access

- Frontend: http://localhost:3000
- Backend: http://localhost:5000
