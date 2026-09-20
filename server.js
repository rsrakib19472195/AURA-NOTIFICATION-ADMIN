const express = require("express");

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/notification.html");
});

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        server: "AURA Notification Server",
        appIdConfigured: !!ONESIGNAL_APP_ID,
        apiKeyConfigured: !!ONESIGNAL_REST_API_KEY
    });
});

app.post("/api/notifications/send", async (req, res) => {

    try {

        if (!ONESIGNAL_APP_ID) {
            return res.status(500).json({
                success: false,
                error: "ONESIGNAL_APP_ID is missing in Render Environment Variables."
            });
        }

        if (!ONESIGNAL_REST_API_KEY) {
            return res.status(500).json({
                success: false,
                error: "ONESIGNAL_REST_API_KEY is missing in Render Environment Variables."
            });
        }

        const {
            target,
            externalId,
            title,
            message,
            icon,
            image,
            url
        } = req.body;

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                error: "Title and message are required."
            });
        }

        const body = {
            app_id: ONESIGNAL_APP_ID,
            target_channel: "push",
            headings: {
                en: String(title)
            },
            contents: {
                en: String(message)
            }
        };

        /*
         * TARGET
         */

        if (target === "specific") {

            if (!externalId) {
                return res.status(400).json({
                    success: false,
                    error: "Firebase UID / External ID is required."
                });
            }

            body.include_aliases = {
                external_id: [String(externalId)]
            };

        } else {

            body.included_segments = [
                "Subscribed Users"
            ];

        }

        /*
         * OPTIONAL ICON
         */

        if (icon) {
            body.chrome_web_icon = String(icon);
            body.chrome_web_badge = String(icon);
        }

        /*
         * OPTIONAL IMAGE
         */

        if (image) {
            body.chrome_web_image = String(image);
            body.big_picture = String(image);
        }

        /*
         * OPTIONAL CLICK URL
         */

        if (url) {
            body.url = String(url);
            body.web_url = String(url);
        }

        console.log("========== ONESIGNAL REQUEST ==========");
        console.log(JSON.stringify(body, null, 2));

        const response = await fetch(
            "https://api.onesignal.com/notifications",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Key " + ONESIGNAL_REST_API_KEY
                },

                body: JSON.stringify(body)
            }
        );

        const responseText = await response.text();

        console.log("========== ONESIGNAL RESPONSE ==========");
        console.log("HTTP STATUS:", response.status);
        console.log(responseText);

        let result;

        try {
            result = JSON.parse(responseText);
        } catch {
            result = {
                raw: responseText
            };
        }

        if (!response.ok) {

            return res.status(response.status).json({
                success: false,
                error: "OneSignal rejected the notification.",
                httpStatus: response.status,
                details: result
            });

        }

        return res.json({
            success: true,
            message: "Notification sent successfully.",
            onesignal: result
        });

    } catch (error) {

        console.error("SERVER ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error.message || "Server error"
        });

    }

});


app.listen(PORT, () => {
    console.log(
        `AURA Notification Server running on port ${PORT}`
    );
});
