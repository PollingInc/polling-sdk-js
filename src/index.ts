interface Window {
    pollingSurveyPollInterval?: number;
}

interface CustomerPayload {
    customerId: string;
    apiKey: string;
    onSuccess?: (data: any) => void;
    onFailure?: (error: string) => void;
    onReward?: (reward: Reward) => void;
    onSurveyAvailable?: () => void;
    disableAvailableSurveysPoll?: boolean;
}

interface SurveyData {
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

interface TriggeredSurvey {
    survey: {
        survey_uuid: string;
        name: string;
    };
    delayed_timestamp: string,
    delay?: number
}

class Reward {
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

class Polling {
    baseUrl: string = "https://app.polling.com";
    baseApiUrl: string = "https://api.polling.com";

    customerId?: string;
    apiKey?: string;

    initialized: boolean = false;
    currentSurveyUuid: string | null = null;
    surveyPollRateMsec: number = 30000;
    isQuickSurveysEnabled: boolean = false;
    isSurveyCurrentlyVisible: boolean = false;
    isAvailableSurveysCheckDisabled: boolean = false;
    cachedAvailableSurveys: any = {};
    numSurveysAvailable: number = 0;
    onSuccessCallback?: (data: any) => void;
    onFailureCallback?: (error: string) => void;
    onRewardCallback?: (reward: Reward) => void;
    onSurveyAvailableCallback?: () => void;


    surveyViewBaseUrl: string;
    surveyApiBaseUrl: string;
    eventApiBaseUrl: string;
    surveyViewUrl?: string;
    surveyApiUrl?: string;
    eventApiUrl?: string;

    constructor() {
        this.surveyViewBaseUrl = this.baseUrl + "/sdk";
        this.surveyApiBaseUrl = this.baseApiUrl + "/api/sdk/surveys";
        this.eventApiBaseUrl = this.baseApiUrl + "/api/events/collect";
    }

    public initialize(customerPayload: CustomerPayload) {
        if (this.initialized) {
            return;
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

        if (window.pollingSurveyPollInterval) {
            clearInterval(window.pollingSurveyPollInterval);
        }
        window.pollingSurveyPollInterval = setInterval(() => this.intervalLogic(), this.surveyPollRateMsec);
        this.intervalLogic();
    }

    public setCustomerId(customerId: string) {
        this.customerId = customerId;
        this.updateUrls();
    }

    public setApiKey(apiKey: string) {
        this.apiKey = apiKey;
        this.updateUrls();
    }


    public logPurchase(integerCents: number) {
        this.logEvent("Purchase", integerCents.toString());
    }

    public logSession() {
        this.logEvent("Session");
    }

    public logEvent(eventName: string, eventValue: string = "") {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', this.eventApiUrl!, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

        const that = this;

        xhr.onload = function () {
            if (!(this.status >= 200 && this.status < 300)) {
                that.onFailure('Failed to log event: ' + this.status);
            }
        };

        xhr.onerror = function () {
            that.onFailure('Network error.');
        };

        xhr.onreadystatechange = function () {
            if (this.readyState == 4 && this.status == 200) {
                const response = JSON.parse(this.responseText);

                if (!response?.triggered_surveys?.length) {
                    return;
                }

                that.onTriggeredSurveysUpdated(response.triggered_surveys as TriggeredSurvey[]);
            }
        };

        const postData = 'event=' + eventName + '&value=' + eventValue;
        xhr.send(postData);
    }

    public enableQuickSurveys() {
        this.isQuickSurveysEnabled = true;
        this.loadAvailableSurveys();
    }

    public disableQuickSurveys() {
        this.isQuickSurveysEnabled = false;
    }

    public showQuickSurvey(surveyUuid: string) {
        if (this.isSurveyCurrentlyVisible) return;

        this.currentSurveyUuid = surveyUuid;
        this.showCornerPopup(`${this.surveyViewBaseUrl}/survey/${surveyUuid}?customer_id=${this.customerId}&api_key=${this.apiKey}&quick=true`);
    }

    public showSurvey(surveyUuid: string) {
        if (this.isSurveyCurrentlyVisible) return;

        this.currentSurveyUuid = surveyUuid;
        this.showFullPagePopup(`${this.surveyViewBaseUrl}/survey/${surveyUuid}?customer_id=${this.customerId}&api_key=${this.apiKey}`);
    }

    public showAvailableSurveys() {
        if (this.isSurveyCurrentlyVisible) return;

        this.showFullPagePopup(this.surveyViewUrl!);
    }

    public getLocalSurveyResults(surveyUiid: string) {
        return localStorage.getItem(surveyUiid);
    }



    // Internal Methods

    private updateUrls() {
        this.surveyViewUrl = `${this.surveyViewBaseUrl}/available-surveys?customer_id=${this.customerId}&api_key=${this.apiKey}`;
        this.surveyApiUrl = `${this.surveyApiBaseUrl}/available?customer_id=${this.customerId}&api_key=${this.apiKey}`;
        this.eventApiUrl = `${this.eventApiBaseUrl}?user=${this.customerId}&api_key=${this.apiKey}`;
    }

    private intervalLogic() {
        if (!this.initialized || !this.apiKey || !this.customerId) return;

        if (!this.isAvailableSurveysCheckDisabled) {
            this.loadAvailableSurveys();
        }

        this.checkAvailableTriggeredSurveys();
    }

    private storeLocalSurveyResult(surveyUiid: string, surveyResultData: string) {
        localStorage.setItem(surveyUiid, surveyResultData);
    }

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

    private onTriggeredSurveysUpdated(surveys: TriggeredSurvey[]) {
        let newTriggeredSurveys = [
            ...JSON.parse(localStorage.getItem('polling:triggered_surveys') || '[]'),
            ...surveys
        ];

        newTriggeredSurveys = newTriggeredSurveys.filter((obj, index) =>
            newTriggeredSurveys.findIndex((item) => item.location === obj.location) === index
        );

        localStorage.setItem(
            'polling:triggered_surveys',
            JSON.stringify(newTriggeredSurveys)
        );

        this.checkAvailableTriggeredSurveys();
    }

    private removeTriggeredSurvey(surveyUuid: string) {
        let triggeredSurveys = JSON.parse(localStorage.getItem('polling:triggered_surveys') || '[]') as TriggeredSurvey[];
        triggeredSurveys = triggeredSurveys.filter(triggered => triggered.survey.survey_uuid !== surveyUuid);
        localStorage.setItem('polling:triggered_surveys', JSON.stringify(triggeredSurveys));
    }

    private checkAvailableTriggeredSurveys() {
        if (this.isSurveyCurrentlyVisible) return;

        let triggeredSurveys = JSON.parse(localStorage.getItem('polling:triggered_surveys') || '[]') as TriggeredSurvey[];

        if (!triggeredSurveys.length) {
            return;
        }

        const now = (new Date()).getTime();
        const triggeredSurvey = triggeredSurveys.find(triggered => {
            const delayedTs = new Date(triggered.delayed_timestamp);
            return delayedTs.getTime() < now;
        });

        if (triggeredSurvey) {
            this.showSurvey(triggeredSurvey.survey.survey_uuid);
        }
    }

    private loadAvailableSurveys() {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', this.surveyApiUrl!, true);

        const that = this;

        xhr.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                that.cachedAvailableSurveys = JSON.parse(this.responseText);
                that.onSurveysUpdated();
            } else {
                that.onFailure('Failed to load: ' + this.status);
            }
        };

        xhr.onerror = function () {
            that.onFailure('Network error.');
        };

        xhr.send();
    }

    private onSurveysUpdated() {
        const previousSurveysAvailable = this.numSurveysAvailable;

        if (previousSurveysAvailable == 0 && this.numSurveysAvailable > 0) {
            this.onSurveyAvailable();
        }
        this.numSurveysAvailable = this.cachedAvailableSurveys.data.length;

        if (this.isQuickSurveysEnabled) {
            const quickSurvey = this.cachedAvailableSurveys.data.find((survey: any) => survey.is_quick_survey);
            if (quickSurvey) {
                this.showQuickSurvey(quickSurvey.uuid);
            }
        }
    }

    // Generates a HTML popup
    private showCornerPopup(iframeUrl: string) {
        if (this.isSurveyCurrentlyVisible) {
            return;
        }
        this.isSurveyCurrentlyVisible = true;

        const popup = document.createElement('div');
        popup.style.overflow = 'hidden';
        popup.style.backgroundColor = '#fff';
        popup.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        popup.style.zIndex = '1010';

        popup.style.borderRadius = '10px 10px 0 0';
        popup.style.position = 'fixed';
        popup.style.width = '320px';
        popup.style.height = '30%';
        popup.style.right = '20px';
        popup.style.bottom = '-30%';
        popup.style.transition = 'bottom 0.5s';

        setTimeout(() => { popup.style.bottom = '20px'; }, 100);

        const iframe = document.createElement('iframe');
        iframe.src = iframeUrl;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.addEventListener('load', () => iframe.removeAttribute('srcdoc'));
        iframe.srcdoc = "<center style='margin-top: 60px; font-style: italic;'>Loading survey, one moment...</center>"

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
            document.body.removeChild(popup);
            this.isSurveyCurrentlyVisible = false;
        });

        popup.appendChild(iframe);
        popup.appendChild(closeButton);
        document.body.appendChild(popup);
    }

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
        iframe.srcdoc = "<center style='margin-top: 60px; font-style: italic;'>Loading survey, one moment...</center>"

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
            document.body.removeChild(overlay);
            this.isSurveyCurrentlyVisible = false;
        });

        popup.appendChild(iframe);
        popup.appendChild(closeButton);
        document.body.appendChild(overlay);
    }
}