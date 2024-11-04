export interface SdkPayload {
    customerId: string;
    apiKey: string;
    onSuccess?: (data: any) => void;
    onFailure?: (error: string) => void;
    onReward?: (reward: Reward) => void;
    onSurveyAvailable?: () => void;
    disableAvailableSurveysPoll?: boolean;
}

export interface SurveyData {
    surveyUuid: string;
    data: {
        answers: any;
        reward: {
            value: string;
            name: string;
        };
        sessionId: string;
    };
}

export interface TriggeredSurvey {
    survey: {
        survey_uuid: string;
        name: string;
    };
    delayed_timestamp: string,
    delay?: number
}

export class Reward {
    completedAt: number;
    rewardAmount: number | string;
    rewardName: string;
    uuid: string;

    constructor(completedAt: number, rewardAmount: number | string, rewardName: string, uuid: string) {
        this.completedAt = completedAt;
        this.rewardAmount = rewardAmount;
        this.rewardName = rewardName;
        this.uuid = uuid;
    }
}

export class Polling {
    baseUrl: string = "https://app.polling.com";
    baseApiUrl: string = "https://api.polling.com";

    // baseUrl: string = "http://127.0.0.1:3000";
    // baseApiUrl: string = "http://127.0.0.1";

    customerId?: string;
    apiKey?: string;

    initialized: boolean = false;
    currentSurveyUuid: string | null = null;
    surveyPollRateMsec: number = 60_000; // 1 minute default
    surveyClosePostponeMinutes: number = 30; // 30 minutes default
    isSurveyCurrentlyVisible: boolean = false;
    isAvailableSurveysCheckDisabled: boolean = false;
    cachedAvailableSurveys: any = {};
    numSurveysAvailable: number = 0;
    onSuccessCallback?: (data: any) => void;
    onFailureCallback?: (error: string) => void;
    onRewardCallback?: (reward: Reward) => void;
    onSurveyAvailableCallback?: () => void;

    surveyViewBaseUrl: string;
    surveyApiBaseUrlSDK: string;
    eventApiBaseUrl: string;
    surveyViewUrl?: string;
    surveysDefaultEmbedViewUrl?: string;
    surveyApiUrl?: string;
    eventApiUrl?: string;

    constructor() {
        this.surveyViewBaseUrl = this.baseUrl + "/sdk";
        this.surveyApiBaseUrlSDK = this.baseApiUrl + "/api/sdk/surveys";
        this.eventApiBaseUrl = this.baseApiUrl + "/api/events/collect";
    }

    public initialize(customerPayload: SdkPayload) {
        if (this.initialized) {
            return this;
        }

        this.initialized = true;
        this.isAvailableSurveysCheckDisabled = customerPayload.disableAvailableSurveysPoll || false;

        if (customerPayload.customerId) this.setCustomerId(customerPayload.customerId);
        if (customerPayload.apiKey) this.setApiKey(customerPayload.apiKey);

        this.onSuccessCallback = customerPayload.onSuccess;
        this.onFailureCallback = customerPayload.onFailure;
        this.onRewardCallback = customerPayload.onReward;
        this.onSurveyAvailableCallback = customerPayload.onSurveyAvailable;

        this.setupPostMessageBridge();

        if ((window as any).pollingSurveyPollInterval) {
            clearInterval((window as any).pollingSurveyPollInterval);
        }
        (window as any).pollingSurveyPollInterval = setInterval(() => this.intervalLogic(), this.surveyPollRateMsec);
        this.intervalLogic();

        return this;
    }

    /**
     * On the fly customer_id change
     */
    public setCustomerId(customerId: string) {
        this.customerId = customerId;
        this.updateUrls();

        return this;
    }


    /**
     * On the fly apiKey change
     */
    public setApiKey(apiKey: string) {
        this.apiKey = apiKey;
        this.updateUrls();


        return this;
    }

    public logPurchase(integerCents: number) {
        this.logEvent("Purchase", integerCents.toString());

        return this;
    }

    public logSession() {
        this.logEvent("Session");

        return this;
    }

    public async logEvent(eventName: string, eventValue: number | string = "") {
        try {
            const response = await fetch(this.eventApiUrl!, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    event: eventName,
                    value: eventValue as any
                })
            });

            if (!response.ok) {
                this.onFailure('Failed to log event: ' + response.status);
                return this;
            }

            const responseData = await response.json();

            if (responseData?.triggered_surveys?.length) {
                this.onTriggeredSurveysUpdated(responseData.triggered_surveys as TriggeredSurvey[]);
            }
        } catch (error) {
            this.onFailure('Network error.');
        }


        return this;
    }

    /**
     * Show a survey in a full page popup
     */
    public showSurvey(surveyUuid: string) {
        if (this.isSurveyCurrentlyVisible) return this;

        this.currentSurveyUuid = surveyUuid;
        this.showFullPagePopup(`${this.surveyViewBaseUrl}/survey/${surveyUuid}?customer_id=${this.customerId}&api_key=${this.apiKey}`);
        
        return this;
    }

    /**
     * Standard method to show the available surveys page
     * The format is based on the embed settings on Polling.com
     */
    public showEmbedView() {
        if (this.isSurveyCurrentlyVisible) return this;

        this.showFullPagePopup(this.surveysDefaultEmbedViewUrl!);

        return this;
    }

    public getLocalSurveyResults(surveyUiid: string) {
        return localStorage.getItem(surveyUiid);
    }



    // Internal Methods

    private updateUrls() {
        this.surveysDefaultEmbedViewUrl = `${this.baseUrl}/embed/${this.apiKey}?customer_id=${this.customerId}`;
        this.surveyViewUrl = `${this.surveyViewBaseUrl}/available-surveys?customer_id=${this.customerId}&api_key=${this.apiKey}`;
        this.surveyApiUrl = `${this.surveyApiBaseUrlSDK}/available?customer_id=${this.customerId}&api_key=${this.apiKey}`;
        this.eventApiUrl = `${this.eventApiBaseUrl}?user=${this.customerId}&api_key=${this.apiKey}`;
    }

    /**
     * Pool method that checks for available surveys and triggered surveys
     */
    private intervalLogic() {
        if (!this.initialized || !this.apiKey || !this.customerId) return this;

        if (!this.isAvailableSurveysCheckDisabled) {
            this.loadAvailableSurveys();
        }

        this.checkAvailableTriggeredSurveys();

        return this;
    }

    /**
     * Store the survey results in localstorage
     */
    private storeLocalSurveyResult(surveyUiid: string, surveyResultData: string) {
        localStorage.setItem(surveyUiid, surveyResultData);
    }

    /**
     * Setup a postMessage bridge to communicate with the survey iframe
     * and handle actions when the survey state change
     */
    private setupPostMessageBridge() {
        window.addEventListener('message', (event: MessageEvent) => {
            const allowedOriginPattern = /https?:\/\/([a-zA-Z0-9]+\.)*polling\.com/;

            if (allowedOriginPattern.test(event.origin)) {

                console.log('Received message:', event.data);
                switch (event.data.event) {
                    case 'survey.completed':
                        this.storeLocalSurveyResult(event.data.surveyUuid, JSON.stringify(event.data.data.answers));

                        if (this.onSuccessCallback) this.onSuccessCallback(event.data.data);

                        this.removeTriggeredSurvey(event.data.surveyUuid);

                        if (Object.keys(event.data.data.reward).length > 0 && parseInt(event.data.data.reward.value) > 0) {
                            const reward = new Reward(Date.now(), parseInt(event.data.data.reward.value), event.data.data.reward.name, event.data.data.sessionId);
                            if (this.onRewardCallback) this.onRewardCallback(reward);
                        }

                        this.loadAvailableSurveys();

                        break;
                    case 'survey.error':
                    case 'survey.empty':
                        this.removeTriggeredSurvey(event.data.surveyUuid);

                        break;
                    default:
                        console.log(event.data);
                        break;
                }
            } else {
                console.error('Message origin not allowed:', event.origin);
            }
        });
    }

    private onFailure(error: string) {
        if (this.onFailureCallback) {
            this.onFailureCallback(error);
        }
    }

    private onSurveyAvailable() {
        if (this.onSurveyAvailableCallback) {
            this.onSurveyAvailableCallback();
        }
    }

    /**
     * Update the localstorage cache with the new triggered surveys
     */
    private onTriggeredSurveysUpdated(surveys: TriggeredSurvey[]) {
        // Add the new trigered surveys to the localstorage cache
        let newTriggeredSurveys = [
            ...JSON.parse(localStorage.getItem('polling:triggered_surveys') || '[]'),
            ...surveys
        ];

        // Remove duplicates, to prevent showing the same survey multiple times
        newTriggeredSurveys = newTriggeredSurveys.filter((obj, index) =>
            newTriggeredSurveys.findIndex((item) => item.location === obj.location) === index
        );

        localStorage.setItem(
            'polling:triggered_surveys',
            JSON.stringify(newTriggeredSurveys)
        );

        this.checkAvailableTriggeredSurveys();
    }

    /**
     * Remove a triggered survey from the localstorage cache
     */
    private removeTriggeredSurvey(surveyUuid: string) {
        // Retrieve from cache, remove the survey, and store it back
        let triggeredSurveys = JSON.parse(localStorage.getItem('polling:triggered_surveys') || '[]') as TriggeredSurvey[];

        triggeredSurveys = triggeredSurveys.filter(triggered => triggered.survey.survey_uuid !== surveyUuid);

        localStorage.setItem('polling:triggered_surveys', JSON.stringify(triggeredSurveys));
    }

    private postponeTriggeredSurvey(surveyUuid: string) {
        // Retrieve from cache, update the delay, and store it back
        let triggeredSurveys = JSON.parse(localStorage.getItem('polling:triggered_surveys') || '[]') as TriggeredSurvey[];

        let triggeredSurvey = triggeredSurveys.find(triggered => triggered.survey.survey_uuid === surveyUuid);

        if (!triggeredSurvey) return;

        triggeredSurvey.delay = (triggeredSurvey?.delay|| 0) + (this.surveyClosePostponeMinutes * 60);
        triggeredSurvey.delayed_timestamp = this.addMinutes(new Date(triggeredSurvey.delayed_timestamp), this.surveyClosePostponeMinutes).toISOString();

        // Update the entry on the array
        triggeredSurveys = triggeredSurveys.map(triggered => {
            if (triggered.survey.survey_uuid === surveyUuid) {
                return triggeredSurvey;
            }
            return triggered;
        });

        localStorage.setItem('polling:triggered_surveys', JSON.stringify(triggeredSurveys));
    }

    /**
     * Check if there are any triggered surveys that should be shown to the user
     * If there are, show the first one that is valid in a popup
     */
    private async checkAvailableTriggeredSurveys() {
        if (this.isSurveyCurrentlyVisible) return;

        // Look for all triggered surveys stored in localstorage
        let triggeredSurveys = JSON.parse(localStorage.getItem('polling:triggered_surveys') || '[]') as TriggeredSurvey[];

        if (!triggeredSurveys.length) {
            return;
        }

        // Find the first survey that the delayed_timestamp already passed
        const now = (new Date()).getTime();
        const triggeredSurvey = triggeredSurveys.find(triggered => {
            const delayedTs = new Date(triggered.delayed_timestamp);
            return delayedTs.getTime() < now;
        });

        if (!triggeredSurvey) return;

        // If we found one, check if still valid (active and etc.)
        let surveyDetails = await this.getSurveyDetails(triggeredSurvey.survey.survey_uuid);

        if (!surveyDetails || surveyDetails.user_survey_status != "available") {
            // Survey not valid anymore, remove it from triggered surveys, and check again for the next survey
            this.removeTriggeredSurvey(triggeredSurvey.survey.survey_uuid);

            this.checkAvailableTriggeredSurveys();
            return;
        }

        // Survey found and valid, show it to the user
        this.showSurvey(triggeredSurvey.survey.survey_uuid);
    }

    /**
     * Check the API endpoint to see if there are any available surveys
     * on the embed for the current user
     */
    private async loadAvailableSurveys() {
        try {
            const response = await fetch(this.surveyApiUrl!, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                this.onFailure('Failed to load: ' + response.status);
                return;
            }

            // Store the available surveys in the cache and trigger the callback
            this.cachedAvailableSurveys = await response.json();
            this.onSurveysUpdated();
        } catch (error) {
            this.onFailure('Network error.');
        }
    }

    /**
     * Fetch details for a given survey uuid
     * Useful to check if a survey still valid.
     */
    private async getSurveyDetails(surveyUuid: string) {
        let url = `${this.baseApiUrl}/api/sdk/surveys/${surveyUuid}?customer_id=${this.customerId}&api_key=${this.apiKey}`;

        try {
            const response = await fetch(url!, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                this.onFailure('Failed to load: ' + response.status);
                return null;
            }

            let json = await response.json();

            return json?.data ?? {};
        } catch (error) {
            this.onFailure('Network error.');

            return null;
        }
    }

    /**
     * Callback method that is triggered when the available surveys are updated
     */
    private onSurveysUpdated() {
        const previousSurveysAvailable = this.numSurveysAvailable;

        if (previousSurveysAvailable == 0 && this.numSurveysAvailable > 0) {
            this.onSurveyAvailable();
        }
        this.numSurveysAvailable = this.cachedAvailableSurveys.data.length;
    }

    // Methods to generate the HTML popup
    private showFullPagePopup(iframeUrl: string) {
        if (this.isSurveyCurrentlyVisible) {
            return;
        }

        this.isSurveyCurrentlyVisible = true;

        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = '1000';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';

        const popup = document.createElement('div');
        popup.style.overflow = 'hidden';
        popup.style.backgroundColor = '#fff';
        popup.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        popup.style.zIndex = '1010';
        popup.style.borderRadius = '10px';
        popup.style.position = 'relative';
        popup.style.width = '80%';
        popup.style.maxWidth = '600px';
        popup.style.height = '80%';
        overlay.appendChild(popup);
    
        const iframe = document.createElement('iframe');
        iframe.src = iframeUrl;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.addEventListener('load', () => iframe.removeAttribute('srcdoc'));
        iframe.srcdoc = "<center style='margin-top: 60px;'>Loading survey, one moment...</center>"

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.style.position = 'absolute';
        closeButton.style.top = '10px';
        closeButton.style.right = '10px';
        closeButton.style.border = 'none';
        closeButton.style.background = 'none';
        closeButton.style.fontSize = '24px';
        closeButton.style.cursor = 'pointer';
        closeButton.addEventListener('click', () => {
            document.body.removeChild(overlay || popup);
            this.isSurveyCurrentlyVisible = false;

            // Survey was cloned without being finished, postpone it
            this.postponeTriggeredSurvey(this.currentSurveyUuid!);
        });

        popup.appendChild(iframe);
        popup.appendChild(closeButton);

        document.body.appendChild(overlay || popup);
    }
    
    private addMinutes(date: Date, minutes: number) {
        return new Date(date.getTime() + minutes*60000);
    }
}