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

/* =========================================
   ONESIGNAL REQUEST HELPER
========================================= */

async function oneSignalRequest(
    endpoint,
    options = {}
) {
    const response = await fetch(
        `https://api.onesignal.com${endpoint}`,
        {
            ...options,

            headers: {
                "Content-Type":
                    "application/json",

                "Authorization":
                    `Key ${ONESIGNAL_REST_API_KEY}`,

                ...(options.headers || {})
            }
        }
    );

    const rawText =
        await response.text();

    let data;

    try {
        data = JSON.parse(rawText);
    } catch {
        data = {
            raw: rawText
        };
    }

    return {
        response,
        data
    };
}

/* =========================================
   FIND ONESIGNAL USER BY EXTERNAL ID
========================================= */

async function findOneSignalUser(
    externalId
) {
    const encodedId =
        encodeURIComponent(
            String(externalId).trim()
        );

    /*
     * OneSignal Users API
     */

    const result =
        await oneSignalRequest(
            `/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodedId}`,
            {
                method: "GET"
            }
        );

    console.log(
        "🔎 OneSignal user lookup:",
        result.response.status
    );

    console.log(
        JSON.stringify(
            result.data,
            null,
            2
        )
    );

    if (!result.response.ok) {
        return {
            success: false,
            data: result.data
        };
    }

    return {
        success: true,
        data: result.data
    };
}

/* =========================================
   EXTRACT PUSH SUBSCRIPTIONS
========================================= */

function getPushSubscriptionIds(
    userData
) {
    const ids = [];

    /*
     * New OneSignal user response
     */

    if (
        Array.isArray(
            userData?.subscriptions
        )
    ) {
        userData.subscriptions.forEach(
            subscription => {

                if (
                    subscription &&
                    subscription.id
                ) {
                    const type =
                        String(
                            subscription.type ||
                            ""
                        ).toLowerCase();

                    const subscribed =
                        subscription.subscribed;

                    /*
                     * Push subscription
                     */

                    if (
                        type === "web" ||
                        type === "chrome_web" ||
                        type === "android" ||
                        type === "ios" ||
                        type === "push" ||
                        !type
                    ) {
                        if (
                            subscribed !== false
                        ) {
                            ids.push(
                                String(
                                    subscription.id
                                )
                            );
                        }
                    }
                }
            }
        );
    }

    /*
     * Some API responses may expose
     * subscriptions differently.
     */

    if (
        Array.isArray(
            userData?.push_subscriptions
        )
    ) {
        userData.push_subscriptions.forEach(
            subscription => {

                if (
                    subscription?.id
                ) {
                    if (
                        subscription.subscribed !== false
                    ) {
                        ids.push(
                            String(
                                subscription.id
                            )
                        );
                    }
                }
            }
        );
    }

    return [
        ...new Set(ids)
    ];
}

/* =========================================
   HOME
========================================= */

app.get("/", (req, res) => {
    res.sendFile(
        __dirname +
        "/notification.html"
    );
});

/* =========================================
   SEND NOTIFICATION
========================================= */

app.post(
    "/api/notifications/send",
    async (req, res) => {

        try {

            const {
                target,
                externalId,
                title,
                message,
                icon,
                image,
                url
            } = req.body;

            /* =================================
               VALIDATION
            ================================= */

            if (
                !ONESIGNAL_REST_API_KEY
            ) {
                return res.status(500).json({
                    success: false,

                    error:
                        "OneSignal REST API Key পাওয়া যায়নি। Render Environment Variables চেক করুন।"
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

            /* =================================
               BASE NOTIFICATION
            ================================= */

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

            /* =================================
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

            /* =================================
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

            /* =================================
               CLICK URL

               IMPORTANT:
               Only "url" is used.
               Do NOT send web_url/app_url.
            ================================= */

            if (
                url &&
                String(url).trim()
            ) {

                notification.url =
                    String(url).trim();

            }

            /* =================================
               ALL USERS
            ================================= */

            if (
                target !== "specific"
            ) {

                console.log(
                    "📢 Target: ALL USERS"
                );

                /*
                 * This is the same working
                 * targeting method you already
                 * confirmed works.
                 */

                notification.included_segments = [
                    "Subscribed Users"
                ];

            }

            /* =================================
               SPECIFIC USER
            ================================= */

            else {

                if (
                    !externalId ||
                    !String(
                        externalId
                    ).trim()
                ) {

                    return res.status(400).json({
                        success: false,

                        error:
                            "Firebase UID / External ID দিন।"
                    });

                }

                const cleanExternalId =
                    String(
                        externalId
                    ).trim();

                console.log(
                    "===================================="
                );

                console.log(
                    "🎯 SPECIFIC USER"
                );

                console.log(
                    "External ID:",
                    cleanExternalId
                );

                console.log(
                    "===================================="
                );

                /*
                 * First try direct External ID.
                 *
                 * This is the preferred method.
                 */

                notification.include_aliases = {
                    external_id: [
                        cleanExternalId
                    ]
                };

                /*
                 * IMPORTANT:
                 *
                 * Do NOT add included_segments
                 * together with include_aliases.
                 */

            }

            /* =================================
               SEND
            ================================= */

            console.log(
                "📤 Sending notification:"
            );

            console.log(
                JSON.stringify(
                    notification,
                    null,
                    2
                )
            );

            const result =
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

            console.log(
                "OneSignal HTTP:",
                result.response.status
            );

            console.log(
                "OneSignal response:",
                JSON.stringify(
                    result.data,
                    null,
                    2
                )
            );

            /* =================================
               SPECIFIC USER FALLBACK
            ================================= */

            /*
             * If External ID does not resolve
             * to a subscribed player, we do a
             * second lookup and try subscription
             * IDs directly.
             */

            if (
                target === "specific" &&
                Array.isArray(
                    result.data?.errors
                ) &&
                result.data.errors.includes(
                    "All included players are not subscribed"
                )
            ) {

                console.log(
                    "⚠️ External ID did not resolve to active subscription."
                );

                console.log(
                    "🔎 Trying OneSignal user lookup..."
                );

                const userResult =
                    await findOneSignalUser(
                        externalId
                    );

                if (
                    userResult.success
                ) {

                    const subscriptionIds =
                        getPushSubscriptionIds(
                            userResult.data
                        );

                    console.log(
                        "📱 Active subscription IDs:",
                        subscriptionIds
                    );

                    if (
                        subscriptionIds.length > 0
                    ) {

                        /*
                         * Send directly to the
                         * discovered subscriptions.
                         */

                        const directNotification = {
                            ...notification
                        };

                        delete directNotification.include_aliases;

                        directNotification
                            .include_subscription_ids =
                            subscriptionIds;

                        console.log(
                            "📤 Sending directly to subscriptions..."
                        );

                        const directResult =
                            await oneSignalRequest(
                                "/notifications",
                                {
                                    method: "POST",

                                    body:
                                        JSON.stringify(
                                            directNotification
                                        )
                                }
                            );

                        console.log(
                            "Direct send response:",
                            JSON.stringify(
                                directResult.data,
                                null,
                                2
                            )
                        );

                        if (
                            directResult.response.ok &&
                            !Array.isArray(
                                directResult.data?.errors
                            )
                        ) {

                            return res.json({
                                success: true,

                                message:
                                    "Notification sent successfully!",

                                onesignal:
                                    directResult.data,

                                targeting:
                                    "subscription_ids"
                            });

                        }

                    }

                }

            }

            /* =================================
               API ERROR
            ================================= */

            if (
                !result.response.ok
            ) {

                return res.status(
                    result.response.status
                ).json({

                    success: false,

                    error:
                        Array.isArray(
                            result.data?.errors
                        )
                            ? result.data.errors.join(
                                ", "
                            )
                            : (
                                result.data?.message ||
                                "OneSignal notification failed."
                            ),

                    onesignal:
                        result.data

                });

            }

            /* =================================
               ONESIGNAL ERROR
            ================================= */

            if (
                Array.isArray(
                    result.data?.errors
                ) &&
                result.data.errors.length > 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        result.data.errors.join(
                            ", "
                        ),

                    onesignal:
                        result.data

                });

            }

            /* =================================
               SUCCESS
            ================================= */

            return res.json({

                success: true,

                message:
                    "Notification sent successfully!",

                notificationId:
                    result.data?.id ||
                    null,

                onesignal:
                    result.data

            });

        } catch (error) {

            console.error(
                "❌ Notification server error:",
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

/* =========================================
   SERVER START
========================================= */

app.listen(
    PORT,
    () => {

        console.log(
            `🚀 AURA Notification Admin running on port ${PORT}`
        );

    }
);
