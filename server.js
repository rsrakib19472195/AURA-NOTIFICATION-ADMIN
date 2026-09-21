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

const ONE_SIGNAL_API =
    "https://api.onesignal.com";


// ============================================================
// HOME
// ============================================================

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/notification.html");
});


// ============================================================
// ONESIGNAL REQUEST HELPER
// ============================================================

async function oneSignalRequest(path, options = {}) {

    if (!ONESIGNAL_REST_API_KEY) {
        throw new Error(
            "OneSignal REST API Key পাওয়া যায়নি। Render Environment Variables check করুন।"
        );
    }

    const response = await fetch(
        ONE_SIGNAL_API + path,
        {
            ...options,
            headers: {
                "Content-Type": "application/json",
                "Authorization":
                    `Key ${ONESIGNAL_REST_API_KEY}`,
                ...(options.headers || {})
            }
        }
    );

    const text = await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        data = {
            raw: text
        };
    }

    return {
        response,
        data
    };
}


// ============================================================
// CHECK SPECIFIC USER
// ============================================================

app.get(
    "/api/notifications/check-user",
    async (req, res) => {

        try {

            const externalId =
                String(
                    req.query.externalId || ""
                ).trim();

            if (!externalId) {

                return res.status(400).json({
                    success: false,
                    error:
                        "externalId দিন।"
                });
            }


            const result =
                await oneSignalRequest(
                    `/apps/${encodeURIComponent(
                        ONESIGNAL_APP_ID
                    )}/users/by/external_id/${encodeURIComponent(
                        externalId
                    )}`
                );


            if (!result.response.ok) {

                return res.status(
                    result.response.status
                ).json({
                    success: false,
                    found: false,
                    error:
                        Array.isArray(
                            result.data?.errors
                        )
                            ? result.data.errors.join(", ")
                            : (
                                result.data?.message ||
                                "OneSignal user পাওয়া যায়নি।"
                            ),
                    onesignal:
                        result.data
                });
            }


            return res.json({

                success: true,

                found: true,

                externalId,

                user:
                    result.data

            });

        } catch (error) {

            return res.status(500).json({

                success: false,

                found: false,

                error:
                    error?.message ||
                    "User check failed."

            });

        }

    }
);


// ============================================================
// SEND NOTIFICATION
// ============================================================

app.post(
    "/api/notifications/send",
    async (req, res) => {

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


            // --------------------------------------------------
            // BASIC VALIDATION
            // --------------------------------------------------

            if (!ONESIGNAL_REST_API_KEY) {

                return res.status(500).json({

                    success: false,

                    error:
                        "OneSignal REST API Key পাওয়া যায়নি। Render Environment Variables check করুন।"

                });

            }


            if (
                !title ||
                !String(title).trim()
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Notification title দিন।"

                });

            }


            if (
                !message ||
                !String(message).trim()
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Notification message দিন।"

                });

            }


            // --------------------------------------------------
            // BASE NOTIFICATION
            // --------------------------------------------------

            const notification = {

                app_id:
                    ONESIGNAL_APP_ID,

                target_channel:
                    "push",

                headings: {

                    en:
                        String(title).trim()

                },

                contents: {

                    en:
                        String(message).trim()

                }

            };


            // --------------------------------------------------
            // ICON
            // --------------------------------------------------

            if (
                icon &&
                String(icon).trim()
            ) {

                notification.chrome_web_icon =
                    String(icon).trim();

                notification.chrome_web_badge =
                    String(icon).trim();

            }


            // --------------------------------------------------
            // IMAGE
            // --------------------------------------------------

            if (
                image &&
                String(image).trim()
            ) {

                notification.chrome_web_image =
                    String(image).trim();

                notification.big_picture =
                    String(image).trim();

            }


            // --------------------------------------------------
            // CLICK URL
            // --------------------------------------------------

            if (
                url &&
                String(url).trim()
            ) {

                notification.url =
                    String(url).trim();

            }


            // ==================================================
            // ALL USERS
            // ==================================================

            if (
                target === "all"
            ) {

                notification.included_segments = [

                    "Total Subscriptions"

                ];

            }


            // ==================================================
            // SUBSCRIPTION
            // ==================================================

            else if (
                target === "subscription" &&
                subscriptionId &&
                String(subscriptionId).trim()
            ) {

                notification.include_subscription_ids = [

                    String(subscriptionId).trim()

                ];

            }


            // ==================================================
            // SPECIFIC USER
            // ==================================================

            else if (
                target === "specific" &&
                externalId &&
                String(externalId).trim()
            ) {

                const uid =
                    String(externalId).trim();


                // ----------------------------------------------
                // First check whether OneSignal knows this user
                // ----------------------------------------------

                const userResult =
                    await oneSignalRequest(
                        `/apps/${encodeURIComponent(
                            ONESIGNAL_APP_ID
                        )}/users/by/external_id/${encodeURIComponent(
                            uid
                        )}`
                    );


                if (!userResult.response.ok) {

                    return res.status(404).json({

                        success: false,

                        error:
                            "এই Firebase UID-এর সাথে কোনো OneSignal user পাওয়া যায়নি।",

                        details:
                            "User-এর APK-তে OneSignal subscription থাকতে হবে এবং native OneSignal user-এর External ID হিসেবে Firebase UID link থাকতে হবে।",

                        externalId:
                            uid,

                        onesignal:
                            userResult.data

                    });

                }


                const oneSignalUser =
                    userResult.data;


                // ----------------------------------------------
                // Target by External ID
                // ----------------------------------------------

                notification.include_aliases = {

                    external_id: [

                        uid

                    ]

                };


                // ----------------------------------------------
                // Send
                // ----------------------------------------------

                const sendResult =
                    await oneSignalRequest(
                        "/notifications",
                        {
                            method: "POST",

                            body:
                                JSON.stringify(
                                    notification
                                )
                        }
                    );


                if (!sendResult.response.ok) {

                    return res.status(
                        sendResult.response.status
                    ).json({

                        success: false,

                        error:
                            Array.isArray(
                                sendResult.data?.errors
                            )
                                ? sendResult.data.errors.join(", ")
                                : (
                                    sendResult.data?.message ||
                                    "Specific notification failed."
                                ),

                        externalId:
                            uid,

                        user:
                            oneSignalUser,

                        onesignal:
                            sendResult.data

                    });

                }


                return res.status(200).json({

                    success: true,

                    message:
                        "Specific user notification sent successfully!",

                    externalId:
                        uid,

                    notificationId:
                        sendResult.data?.id ||
                        null,

                    recipients:
                        sendResult.data?.recipients ||
                        0,

                    onesignal:
                        sendResult.data

                });

            }


            // ==================================================
            // INVALID TARGET
            // ==================================================

            else {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid notification target."

                });

            }


            // ==================================================
            // ALL / SUBSCRIPTION SEND
            // ==================================================

            const sendResult =
                await oneSignalRequest(
                    "/notifications",
                    {

                        method: "POST",

                        body:
                            JSON.stringify(
                                notification
                            )

                    }
                );


            if (!sendResult.response.ok) {

                return res.status(
                    sendResult.response.status
                ).json({

                    success: false,

                    error:
                        Array.isArray(
                            sendResult.data?.errors
                        )
                            ? sendResult.data.errors.join(", ")
                            : (
                                sendResult.data?.message ||
                                "Notification sending failed."
                            ),

                    onesignal:
                        sendResult.data

                });

            }


            return res.status(200).json({

                success: true,

                message:
                    "Notification sent successfully!",

                notificationId:
                    sendResult.data?.id ||
                    null,

                recipients:
                    sendResult.data?.recipients ||
                    0,

                onesignal:
                    sendResult.data

            });


        } catch (error) {

            console.error(
                "Notification server error:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error?.message ||
                    "Internal server error."

            });

        }

    }
);


// ============================================================
// SERVER
// ============================================================

app.listen(
    PORT,
    () => {

        console.log(
            `🚀 AURA Notification Admin running on port ${PORT}`
        );

    }
);const express = require("express");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

const ONESIGNAL_APP_ID =
    process.env.ONESIGNAL_APP_ID ||
    "b4420740-b9f6-4de7-8792-f6302ad38e4d";

const ONESIGNAL_REST_API_KEY =
    process.env.ONESIGNAL_REST_API_KEY;

const ONE_SIGNAL_API =
    "https://api.onesignal.com";


// ============================================================
// HOME
// ============================================================

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/notification.html");
});


// ============================================================
// ONESIGNAL REQUEST HELPER
// ============================================================

async function oneSignalRequest(path, options = {}) {

    if (!ONESIGNAL_REST_API_KEY) {
        throw new Error(
            "OneSignal REST API Key পাওয়া যায়নি। Render Environment Variables check করুন।"
        );
    }

    const response = await fetch(
        ONE_SIGNAL_API + path,
        {
            ...options,
            headers: {
                "Content-Type": "application/json",
                "Authorization":
                    `Key ${ONESIGNAL_REST_API_KEY}`,
                ...(options.headers || {})
            }
        }
    );

    const text = await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        data = {
            raw: text
        };
    }

    return {
        response,
        data
    };
}


// ============================================================
// CHECK SPECIFIC USER
// ============================================================

app.get(
    "/api/notifications/check-user",
    async (req, res) => {

        try {

            const externalId =
                String(
                    req.query.externalId || ""
                ).trim();

            if (!externalId) {

                return res.status(400).json({
                    success: false,
                    error:
                        "externalId দিন।"
                });
            }


            const result =
                await oneSignalRequest(
                    `/apps/${encodeURIComponent(
                        ONESIGNAL_APP_ID
                    )}/users/by/external_id/${encodeURIComponent(
                        externalId
                    )}`
                );


            if (!result.response.ok) {

                return res.status(
                    result.response.status
                ).json({
                    success: false,
                    found: false,
                    error:
                        Array.isArray(
                            result.data?.errors
                        )
                            ? result.data.errors.join(", ")
                            : (
                                result.data?.message ||
                                "OneSignal user পাওয়া যায়নি।"
                            ),
                    onesignal:
                        result.data
                });
            }


            return res.json({

                success: true,

                found: true,

                externalId,

                user:
                    result.data

            });

        } catch (error) {

            return res.status(500).json({

                success: false,

                found: false,

                error:
                    error?.message ||
                    "User check failed."

            });

        }

    }
);


// ============================================================
// SEND NOTIFICATION
// ============================================================

app.post(
    "/api/notifications/send",
    async (req, res) => {

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


            // --------------------------------------------------
            // BASIC VALIDATION
            // --------------------------------------------------

            if (!ONESIGNAL_REST_API_KEY) {

                return res.status(500).json({

                    success: false,

                    error:
                        "OneSignal REST API Key পাওয়া যায়নি। Render Environment Variables check করুন।"

                });

            }


            if (
                !title ||
                !String(title).trim()
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Notification title দিন।"

                });

            }


            if (
                !message ||
                !String(message).trim()
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Notification message দিন।"

                });

            }


            // --------------------------------------------------
            // BASE NOTIFICATION
            // --------------------------------------------------

            const notification = {

                app_id:
                    ONESIGNAL_APP_ID,

                target_channel:
                    "push",

                headings: {

                    en:
                        String(title).trim()

                },

                contents: {

                    en:
                        String(message).trim()

                }

            };


            // --------------------------------------------------
            // ICON
            // --------------------------------------------------

            if (
                icon &&
                String(icon).trim()
            ) {

                notification.chrome_web_icon =
                    String(icon).trim();

                notification.chrome_web_badge =
                    String(icon).trim();

            }


            // --------------------------------------------------
            // IMAGE
            // --------------------------------------------------

            if (
                image &&
                String(image).trim()
            ) {

                notification.chrome_web_image =
                    String(image).trim();

                notification.big_picture =
                    String(image).trim();

            }


            // --------------------------------------------------
            // CLICK URL
            // --------------------------------------------------

            if (
                url &&
                String(url).trim()
            ) {

                notification.url =
                    String(url).trim();

            }


            // ==================================================
            // ALL USERS
            // ==================================================

            if (
                target === "all"
            ) {

                notification.included_segments = [

                    "Total Subscriptions"

                ];

            }


            // ==================================================
            // SUBSCRIPTION
            // ==================================================

            else if (
                target === "subscription" &&
                subscriptionId &&
                String(subscriptionId).trim()
            ) {

                notification.include_subscription_ids = [

                    String(subscriptionId).trim()

                ];

            }


            // ==================================================
            // SPECIFIC USER
            // ==================================================

            else if (
                target === "specific" &&
                externalId &&
                String(externalId).trim()
            ) {

                const uid =
                    String(externalId).trim();


                // ----------------------------------------------
                // First check whether OneSignal knows this user
                // ----------------------------------------------

                const userResult =
                    await oneSignalRequest(
                        `/apps/${encodeURIComponent(
                            ONESIGNAL_APP_ID
                        )}/users/by/external_id/${encodeURIComponent(
                            uid
                        )}`
                    );


                if (!userResult.response.ok) {

                    return res.status(404).json({

                        success: false,

                        error:
                            "এই Firebase UID-এর সাথে কোনো OneSignal user পাওয়া যায়নি।",

                        details:
                            "User-এর APK-তে OneSignal subscription থাকতে হবে এবং native OneSignal user-এর External ID হিসেবে Firebase UID link থাকতে হবে।",

                        externalId:
                            uid,

                        onesignal:
                            userResult.data

                    });

                }


                const oneSignalUser =
                    userResult.data;


                // ----------------------------------------------
                // Target by External ID
                // ----------------------------------------------

                notification.include_aliases = {

                    external_id: [

                        uid

                    ]

                };


                // ----------------------------------------------
                // Send
                // ----------------------------------------------

                const sendResult =
                    await oneSignalRequest(
                        "/notifications",
                        {
                            method: "POST",

                            body:
                                JSON.stringify(
                                    notification
                                )
                        }
                    );


                if (!sendResult.response.ok) {

                    return res.status(
                        sendResult.response.status
                    ).json({

                        success: false,

                        error:
                            Array.isArray(
                                sendResult.data?.errors
                            )
                                ? sendResult.data.errors.join(", ")
                                : (
                                    sendResult.data?.message ||
                                    "Specific notification failed."
                                ),

                        externalId:
                            uid,

                        user:
                            oneSignalUser,

                        onesignal:
                            sendResult.data

                    });

                }


                return res.status(200).json({

                    success: true,

                    message:
                        "Specific user notification sent successfully!",

                    externalId:
                        uid,

                    notificationId:
                        sendResult.data?.id ||
                        null,

                    recipients:
                        sendResult.data?.recipients ||
                        0,

                    onesignal:
                        sendResult.data

                });

            }


            // ==================================================
            // INVALID TARGET
            // ==================================================

            else {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid notification target."

                });

            }


            // ==================================================
            // ALL / SUBSCRIPTION SEND
            // ==================================================

            const sendResult =
                await oneSignalRequest(
                    "/notifications",
                    {

                        method: "POST",

                        body:
                            JSON.stringify(
                                notification
                            )

                    }
                );


            if (!sendResult.response.ok) {

                return res.status(
                    sendResult.response.status
                ).json({

                    success: false,

                    error:
                        Array.isArray(
                            sendResult.data?.errors
                        )
                            ? sendResult.data.errors.join(", ")
                            : (
                                sendResult.data?.message ||
                                "Notification sending failed."
                            ),

                    onesignal:
                        sendResult.data

                });

            }


            return res.status(200).json({

                success: true,

                message:
                    "Notification sent successfully!",

                notificationId:
                    sendResult.data?.id ||
                    null,

                recipients:
                    sendResult.data?.recipients ||
                    0,

                onesignal:
                    sendResult.data

            });


        } catch (error) {

            console.error(
                "Notification server error:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error?.message ||
                    "Internal server error."

            });

        }

    }
);


// ============================================================
// SERVER
// ============================================================

app.listen(
    PORT,
    () => {

        console.log(
            `🚀 AURA Notification Admin running on port ${PORT}`
        );

    }
);
