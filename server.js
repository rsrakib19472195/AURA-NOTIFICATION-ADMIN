const express = require("express");

const app = express();

app.use(express.json({ limit: "1mb" }));
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
            target = "all",
            externalId = "",
            title = "",
            message = "",
            icon = "",
            image = "",
            url = ""
        } = req.body || {};

        const cleanTarget = String(target).trim();
        const cleanExternalId = String(externalId).trim();
        const cleanTitle = String(title).trim();
        const cleanMessage = String(message).trim();
        const cleanIcon = String(icon).trim();
        const cleanImage = String(image).trim();
        const cleanUrl = String(url).trim();

        if (!cleanTitle) {
            return res.status(400).json({
                success: false,
                error: "Notification title is required."
            });
        }

        if (!cleanMessage) {
            return res.status(400).json({
                success: false,
                error: "Notification message is required."
            });
        }

        if (
            cleanTarget !== "all" &&
            cleanTarget !== "specific"
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid notification target."
            });
        }

        /*
         * OneSignal notification body
         */
        const body = {
            app_id: ONESIGNAL_APP_ID,
            target_channel: "push",

            headings: {
                en: cleanTitle
            },

            contents: {
                en: cleanMessage
            }
        };

        /*
         * TARGET
         */

        if (cleanTarget === "specific") {
            if (!cleanExternalId) {
                return res.status(400).json({
                    success: false,
                    error: "Firebase UID / External ID is required."
                });
            }

            body.include_aliases = {
                external_id: [cleanExternalId]
            };

        } else {
            /*
             * Send to every currently subscribed push user.
             */
            body.included_segments = [
                "Subscribed Users"
            ];
        }

        /*
         * ICON
         */

        if (cleanIcon) {
            body.chrome_web_icon = cleanIcon;
            body.chrome_web_badge = cleanIcon;
        }

        /*
         * IMAGE
         */

        if (cleanImage) {
            body.chrome_web_image = cleanImage;
            body.big_picture = cleanImage;
        }

        /*
         * CLICK URL
         */

        if (cleanUrl) {
            body.url = cleanUrl;
            body.web_url = cleanUrl;
        }

        console.log("======================================");
        console.log("AURA NOTIFICATION REQUEST");
        console.log("======================================");
        console.log(JSON.stringify(body, null, 2));

        const response = await fetch(
            "https://api.onesignal.com/notifications",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        "Key " + ONESIGNAL_REST_API_KEY
                },

                body: JSON.stringify(body)
            }
        );

        const responseText = await response.text();

        console.log("======================================");
        console.log("ONESIGNAL RESPONSE");
        console.log("STATUS:", response.status);
        console.log(responseText);
        console.log("======================================");

        let result;

        try {
            result = JSON.parse(responseText);
        } catch {
            result = {
                raw: responseText
            };
        }

        /*
         * OneSignal ERROR
         */

        if (!response.ok) {
            const errors =
                Array.isArray(result?.errors)
                    ? result.errors
                    : [];

            const errorText =
                errors.length
                    ? errors.join(", ")
                    : (
                        result?.error ||
                        result?.message ||
                        "OneSignal rejected the notification."
                    );

            if (
                errorText
                    .toLowerCase()
                    .includes("all included players are not subscribed")
            ) {
                return res.status(400).json({
                    success: false,

                    error:
                        cleanTarget === "specific"
                            ? "এই User-এর কোনো active notification subscription পাওয়া যায়নি। User-কে notification permission Allow করতে হবে এবং OneSignal subscription তৈরি হতে হবে।"
                            : "কোনো subscribed user পাওয়া যায়নি। আগে user/device থেকে notification permission Allow করতে হবে।",

                    onesignal: result
                });
            }

            return res.status(response.status).json({
                success: false,
                error: errorText,
                httpStatus: response.status,
                onesignal: result
            });
        }

        /*
         * SUCCESS
         */

        return res.json({
            success: true,

            message:
                cleanTarget === "specific"
                    ? "Specific user notification sent successfully."
                    : "Notification sent successfully.",

            onesignal: result
        });

    } catch (error) {
        console.error("======================================");
        console.error("SERVER ERROR");
        console.error(error);
        console.error("======================================");

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Notification server error."
        });
    }
});

app.listen(PORT, () => {
    console.log(
        `AURA Notification Server running on port ${PORT}`
    );
});
