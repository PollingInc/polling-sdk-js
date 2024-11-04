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
```

## Usage
Before starting, you will need to obtain an API key from Polling.com, the API key links your integration to a embed on the Polling.com platform.

You will also need to provide a Customer ID (your customer), which is your unique identifier for the user on your application, we'll use this to link them to their surveys and events inside Polling.com.


### Importing the SDK

Add the SDK to your project, if you're using Polling.com JS SDK o on a simple HTML page, where no building is needed you can skip this step:

```javascript
import { Polling } from '@pollinginc/polling-sdk-js';
```

### Initializing the SDK

```javascript
const polling = new Polling();

polling.initialize({
    customerId: "your_customer_id",
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

### Displaying Surveys

#### Show Default Embed View

```javascript
polling.showEmbedView();
```

#### Show a Specific Survey

```javascript
polling.showSurvey("[survey_uuid]");
```

### Logging Events

```javascript
// Log a session event
polling.logSession();

// Log a purchase event
polling.logPurchase(99); // 99 cents

// Log a custom event
polling.logEvent('My Nice Event', 'My Great Value');
```