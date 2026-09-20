const express = require("express");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

const ONESIGNAL_APP_ID =
    process.env.ONESIGNAL_APP_ID ||
    "b4420740-b9f6-4de7-8792-f6302ad38e4d";

const ONESIGNAL_REST_API_KEY =
    process.env.ONESIGNAL_REST_API_KEY;

if (!ONESIGNAL_REST_API_KEY) {
    console.warn(
        "⚠️ ONESIGNAL_REST_API_KEY is not configured in Render Environment Variables."
    );
}

/* ================================
   HOME
================================ */

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/notification.html");
});

/* ================================
   SEND NOTIFICATION
================================ */

app.post("/api/notifications/send", async (req, res) => {
    try {
        const {
            target,
            externalId,
            subscriptionId,
            title,
            message,
            icon,
            image,
            url
        } = req.body;

        if (!ONESIGNAL_REST_API_KEY) {
            return res.status(500).json({
                success: false,
                error:
                    "OneSignal REST API Key পাওয়া যায়নি। Render Environment Variables চেক করুন।"
            });
        }

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                error:
                    "Notification title এবং message প্রয়োজন।"
            });
        }

        const notification = {
            app_id: ONESIGNAL_APP_ID,

            headings: {
                en: String(title)
            },

            contents: {
                en: String(message)
            }
        };

        /* ================================
           ICON
        ================================= */

        if (icon && String(icon).trim()) {
            notification.chrome_web_icon =
                String(icon).trim();

            notification.chrome_web_badge =
                String(icon).trim();
        }

        /* ================================
           IMAGE
        ================================= */

        if (image && String(image).trim()) {
            notification.chrome_web_image =
                String(image).trim();

            notification.big_picture =
                String(image).trim();
        }

        /* ================================
           CLICK URL
        ================================= */

        if (url && String(url).trim()) {
            notification.url =
                String(url).trim();

            notification.web_url =
                String(url).trim();
        }

        /* ================================
           TARGETING
        ================================= */

        if (
            target === "subscription" &&
            subscriptionId &&
            String(subscriptionId).trim()
        ) {
            /*
             * DIRECT SUBSCRIPTION TARGET
             */

            notification.include_subscription_ids = [
                String(subscriptionId).trim()
            ];
        }

        else if (
            target === "specific" &&
            externalId &&
            String(externalId).trim()
        ) {
            /*
             * USER / EXTERNAL ID TARGET
             */

            notification.include_aliases = {
                external_id: [
                    String(externalId).trim()
                ]
            };

            notification.target_channel =
                "push";
        }

        else {
            /*
             * ALL SUBSCRIBED USERS
             */

            notification.included_segments = [
                "Subscribed Users"
            ];

            notification.target_channel =
                "push";
        }

        console.log(
            "===================================="
        );

        console.log(
            "📢 Sending OneSignal notification"
        );

        console.log(
            JSON.stringify(
                notification,
                null,
                2
            )
        );

        console.log(
            "===================================="
        );

        /* ================================
           ONESIGNAL API
        ================================= */

        const response = await fetch(
            "https://api.onesignal.com/notifications",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Authorization":
                        `Key ${ONESIGNAL_REST_API_KEY}`
                },

                body: JSON.stringify(
                    notification
                )
            }
        );

        const rawText =
            await response.text();

        let data;

        try {
            data =
                JSON.parse(rawText);
        } catch {
            data = {
                raw: rawText
            };
        }

        console.log(
            "OneSignal HTTP:",
            response.status
        );

        console.log(
            "OneSignal response:",
            JSON.stringify(
                data,
                null,
                2
            )
        );

        /* ================================
           ERROR
        ================================= */

        if (!response.ok) {
            return res.status(
                response.status
            ).json({
                success: false,

                error:
                    data?.errors?.join?.(", ") ||
                    data?.message ||
                    "OneSignal notification failed.",

                onesignal: data
            });
        }

        /* ================================
           NO RECIPIENT
        ================================= */

        if (
            data?.errors?.includes?.(
                "All included players are not subscribed"
            )
        ) {
            return res.status(400).json({
                success: false,

                error:
                    target === "subscription"
                        ? "এই subscription_id বর্তমানে active subscribed নয়।"
                        : target === "specific"
                        ? "এই External ID-এর কোনো active push subscription পাওয়া যায়নি।"
                        : "কোনো subscribed user পাওয়া যায়নি।",

                onesignal: data
            });
        }

        /* ================================
           SUCCESS
        ================================= */

        return res.json({
            success: true,

            message:
                "Notification sent successfully!",

            onesignal: data
        });

    } catch (error) {
        console.error(
            "❌ Notification error:",
            error
        );

        return res.status(500).json({
            success: false,

            error:
                error?.message ||
                "Server error occurred."
        });
    }
});

/* ================================
   SERVER
================================ */

app.listen(PORT, () => {
    console.log(
        `🚀 AURA Notification Admin running on port ${PORT}`
    );
});
