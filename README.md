# Polling.com JS SDK

## Introduction

Polling.com JS SDK is a JavaScript library for interacting with Polling.com services.

This SDK allows you to send events, log sessions and purchases, display embedded survey pages or show a specific survey seamlessly within your web application.

## Installation

You can install the SDK using npm:

```bash
npm install @pollinginc/polling-sdk-js
```

Or just include the following script tag in your HTML:

```html
<script src="https://api.polling.com/sdk/polling-sdk-latest.js"></script>

// Or specify the version

<script src="https://api.polling.com/sdk/polling-sdk-1.0.6.js"></script>
```

## Usage
Before starting, you will need to obtain an API key from Polling.com, the API key links your integration to a embed on the Polling.com platform.

You will also need to provide a Customer ID (your customer), which is your unique identifier for the user on your application, we'll use this to link them to their surveys and events inside Polling.com.


### Importing the SDK

Add the SDK to your project, if you're using Polling.com JS SDK o on a simple HTML page, with vanilla javascript, you can skip this step:

```javascript
import { Polling } from '@pollinginc/polling-sdk-js';
```

### Initializing the SDK
Initlize the SDK with your API key and Customer ID.

```javascript
const polling = new Polling();

polling.initialize({
    customerId: "your_unique_customer_id",
    apiKey: "your_api_key",
    onSuccess: (data) => {
        console.log("Success:", data);
    },
    onFailure: (error) => {
        console.error("Error:", error);
    },
    onReward: (reward) => {
        console.log("Reward received:", reward);
    },
    onSurveyAvailable: () => {
        console.log("Survey available");
    },
});
```

### Availabel Methods


Available methods are
- `polling.logSession()` - Logs a simple Session event for the given user
- `polling.logPurchase(cents: number)` - Logs a Purchase event for the given user with the amount in cents
- `polling.logEvent(eventName: string, eventValue?: string | number)` - Sends a custom event name and value - **NOTE:** This method is only available for Business+ plans.
- `polling.showEmbedView()` - Opens the Polling.com embed view popup, which will show the user's surveys (list of surveys, random or a fixed survey depending on the user's settings)
- `polling.showSurvey(surveyUiid: string)` - Opens a popup with a specific survey by its UUID
- `polling.setApiKey(apiKey: string)` - Changes the API key on the fly, useful if you want to handle multiple embeds with a single SDK instance
- `polling.setCustomerId(customerId: string)` - Changes the Customer ID on the fly