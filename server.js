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
        "⚠️ ONESIGNAL_REST_API_KEY is not configured."
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

        /* ================================
           VALIDATION
        ================================= */

        if (!ONESIGNAL_REST_API_KEY) {
            return res.status(500).json({
                success: false,
                error:
                    "OneSignal REST API Key পাওয়া যায়নি।"
            });
        }

        if (!title || !String(title).trim()) {
            return res.status(400).json({
                success: false,
                error:
                    "Notification title দিন।"
            });
        }

        if (!message || !String(message).trim()) {
            return res.status(400).json({
                success: false,
                error:
                    "Notification message দিন।"
            });
        }

        /* ================================
           BASE NOTIFICATION
        ================================= */

        const notification = {
            app_id: ONESIGNAL_APP_ID,

            target_channel: "push",

            headings: {
                en: String(title).trim()
            },

            contents: {
                en: String(message).trim()
            }
        };

        /* ================================
           ICON
        ================================= */

        if (
            icon &&
            String(icon).trim()
        ) {
            notification.chrome_web_icon =
                String(icon).trim();

            notification.chrome_web_badge =
                String(icon).trim();
        }

        /* ================================
           IMAGE
        ================================= */

        if (
            image &&
            String(image).trim()
        ) {
            notification.chrome_web_image =
                String(image).trim();

            notification.big_picture =
                String(image).trim();
        }

        /* ================================
           CLICK URL
        ================================= */

        if (
            url &&
            String(url).trim()
        ) {
            notification.url =
                String(url).trim();

            notification.web_url =
                String(url).trim();
        }

        /* ================================
           TARGETING
        ================================= */

        /*
         * 1️⃣ SPECIFIC SUBSCRIPTION
         */

        if (
            target === "subscription" &&
            subscriptionId &&
            String(subscriptionId).trim()
        ) {
            notification.include_subscription_ids = [
                String(subscriptionId).trim()
            ];
        }

        /*
         * 2️⃣ SPECIFIC USER
         */

        else if (
            target === "specific" &&
            externalId &&
            String(externalId).trim()
        ) {
            notification.include_aliases = {
                external_id: [
                    String(externalId).trim()
                ]
            };
        }

        /*
         * 3️⃣ ALL USERS
         *
         * IMPORTANT:
         * OneSignal-এর "Subscribed Users"
         * segment-এর উপর নির্ভর করছি না।
         *
         * এখানে explicit All targeting করা হচ্ছে।
         */

        else {
            notification.included_segments = [
                "Total Subscriptions"
            ];
        }

        /* ================================
           LOG
        ================================= */

        console.log(
            "===================================="
        );

        console.log(
            "📢 AURA NOTIFICATION"
        );

        console.log(
            "Target:",
            target || "all"
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
           ONESIGNAL REQUEST
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
            "HTTP Status:",
            response.status
        );

        console.log(
            "Response:",
            JSON.stringify(
                data,
                null,
                2
            )
        );

        /* ================================
           API ERROR
        ================================= */

        if (!response.ok) {
            return res.status(
                response.status
            ).json({
                success: false,

                error:
                    Array.isArray(data?.errors)
                        ? data.errors.join(", ")
                        : (
                            data?.message ||
                            "OneSignal notification failed."
                        ),

                onesignal: data
            });
        }

        /* ================================
           ONESIGNAL ERROR INSIDE RESPONSE
        ================================= */

        if (
            Array.isArray(data?.errors) &&
            data.errors.length > 0
        ) {
            return res.status(400).json({
                success: false,

                error:
                    data.errors.join(", "),

                onesignal: data
            });
        }

        /* ================================
           SUCCESS
        ================================= */

        return res.status(200).json({
            success: true,

            message:
                "Notification sent successfully!",

            notificationId:
                data?.id || null,

            onesignal: data
        });

    } catch (error) {
        console.error(
            "❌ Server Error:",
            error
        );

        return res.status(500).json({
            success: false,

            error:
                error?.message ||
                "Internal server error."
        });
    }
});

/* ================================
   SERVER START
================================ */

app.listen(PORT, () => {
    console.log(
        `🚀 AURA Notification Admin running on port ${PORT}`
    );
});
