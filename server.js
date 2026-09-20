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
        message: "AURA Notification Server is running"
    });
});

app.post("/api/notifications/send", async (req, res) => {
    try {
        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            return res.status(500).json({
                success: false,
                error: "OneSignal environment variables are missing."
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
            headings: {
                en: String(title)
            },
            contents: {
                en: String(message)
            }
        };

        if (icon) {
            body.chrome_web_icon = String(icon);
            body.chrome_web_badge = String(icon);
        }

        if (image) {
            body.big_picture = String(image);
            body.chrome_web_image = String(image);
        }

        if (url) {
            body.url = String(url);
            body.web_url = String(url);
        }

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

            body.target_channel = "push";

        } else {
            body.included_segments = ["Subscribed Users"];
        }

        const response = await fetch(
            "https://api.onesignal.com/notifications",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Key ${ONESIGNAL_REST_API_KEY}`
                },
                body: JSON.stringify(body)
            }
        );

        const text = await response.text();

        let result;

        try {
            result = JSON.parse(text);
        } catch {
            result = {
                raw: text
            };
        }

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: "OneSignal rejected the notification.",
                details: result
            });
        }

        return res.json({
            success: true,
            message: "Notification sent successfully.",
            onesignal: result
        });

    } catch (error) {
        console.error("Notification error:", error);

        return res.status(500).json({
            success: false,
            error: error.message || "Server error"
        });
    }
});

app.listen(PORT, () => {
    console.log(`AURA Notification Server running on port ${PORT}`);
});