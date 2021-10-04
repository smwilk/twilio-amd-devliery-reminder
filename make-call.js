require("dotenv").config()

// Set Twilio credentials and other variable data as environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const outgoingPhoneNumber = process.env.TWILIO_PHONE_NUMBER
const callBackDomain = process.env.NGROK_URL

// Import dependent packages and dummy data
const express = require("express")
const client = require("twilio")(accountSid, authToken)
const deliveryData = require("./delivery-data.json")

// Create a global app object and port
const app = express()
const port = 3000

// Configure Express to parse received requests with JSON payload
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Global variables
let earliestDeliveryTime = ""
let latestDeliveryTime = ""

// Make outgoing calls
const makeCall = (data) => {
  earliestDeliveryTime = deliveryData[0].deliveryTime.split("-")[0]
  latestDeliveryTime = deliveryData[0].deliveryTime.split("-")[1]
  console.log("Making a call to:", data.phoneNumber)
  client.calls
    .create({
      machineDetection: "DetectMessageEnd",
      asyncAmd: true,
      asyncAmdStatusCallback: callBackDomain + "/amd-callback",
      asyncAmdStatusCallbackMethod: "POST",
      twiml: "<Response><Say>This is Twilio Logistics. We're retrieving the message.</Say><Pause length='10'/></Response>",
      to: data.phoneNumber,
      from: outgoingPhoneNumber,
      statusCallback: callBackDomain + "/status-callback",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST"
    })
    .catch(error => {console.log(error)})
} 

// Output call status
app.post("/status-callback", function (req, res) {
  console.log(`Call status changed: ${req.body.CallStatus}`)
  res.sendStatus(200)
})

// Process after AMD detection
app.post("/amd-callback", function (req, res) {
  const callAnsweredByHuman = req.body.AnsweredBy === "human"
  const deliveryId = deliveryData[0].id
  const deliveryMessage = `This is Twilio Logistics. We'll deliver your package between ${earliestDeliveryTime} and ${latestDeliveryTime} o'clock today. Goodbye!`

  if (callAnsweredByHuman) {
    // When a human answers the call
    console.log("Call picked up by human")
    // Update ongoing call and play delivery reminder message
    client.calls(req.body.CallSid)
      .update({twiml: `<Response><Pause length="1"/><Say>${deliveryMessage}</Say></Response>`})
      .catch(err => console.log(err))
  } else  {
    // When an answering machine answers the call
    const smsReminder = `This is Twilio Logistics. We'll deliver your package ${deliveryId} between ${earliestDeliveryTime} and ${latestDeliveryTime} o'clock today. Goodbye!`
    console.log("Call picked up by machine")
    // Update ongoing call and leave delivery reminder message on answering machine.
    client.calls(req.body.CallSid)
      .update({twiml: `<Response><Pause length="1"/><Say>${deliveryMessage} We'll send you an SMS reminder.</Say><Pause length="1"/></Response>
    `})
      // Send reminder via SMS
      .then(call =>      
        client.messages
          .create({body: smsReminder, from: call.from, to: call.to })
          .then(message => console.log(message.sid)))
      .catch(err => console.log(err))
  }
  res.sendStatus(200)
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`)
})

// Start call
makeCall(deliveryData[0])