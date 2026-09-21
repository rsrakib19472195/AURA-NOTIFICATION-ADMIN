// server.js
// ============================================================
// AURA ARMAN TOUR
// MEDIAN + ONESIGNAL NOTIFICATION SERVER
// ============================================================

const express =
    require("express");

const path =
    require("path");


const app =
    express();


app.use(
    express.json({
        limit: "1mb"
    })
);


app.use(
    express.urlencoded({
        extended: true
    })
);


// ============================================================
// CONFIG
// ============================================================

const PORT =
    process.env.PORT || 10000;


const ONESIGNAL_APP_ID =
    "b4420740-b9f6-4de7-8792-f6302ad38e4d";


const ONESIGNAL_REST_API_KEY =
    process.env.ONESIGNAL_REST_API_KEY;


// ============================================================
// SECURITY CHECK
// ============================================================

if (!ONESIGNAL_REST_API_KEY) {

    console.warn(
        "WARNING: ONESIGNAL_REST_API_KEY is not configured."
    );
}


// ============================================================
// ONESIGNAL REQUEST HELPER
// ============================================================

async function oneSignalRequest(
    endpoint,
    options = {}
) {

    if (!ONESIGNAL_REST_API_KEY) {

        throw new Error(
            "ONESIGNAL_REST_API_KEY environment variable is missing."
        );
    }


    const url =
        "https://api.onesignal.com" +
        endpoint;


    const response =
        await fetch(
            url,
            {
                ...options,

                headers: {
                    "Authorization":
                        `Key ${ONESIGNAL_REST_API_KEY}`,

                    "Content-Type":
                        "application/json",

                    ...(options.headers || {})
                }
            }
        );


    let data = null;

    const text =
        await response.text();


    try {

        data =
            text
                ? JSON.parse(text)
                : null;

    } catch {

        data =
            text;
    }


    return {
        response,
        data
    };
}


// ============================================================
// HEALTH
// ============================================================

app.get(
    "/",
    (req, res) => {

        res.send(
            "AURA ARMAN TOUR Notification Server is running."
        );
    }
);


app.get(
    "/health",
    (req, res) => {

        res.json({
            success: true,
            server: "AURA Notification Server",
            onesignal:
                Boolean(
                    ONESIGNAL_REST_API_KEY
                )
        });
    }
);


// ============================================================
// GET ONESIGNAL USER BY FIREBASE UID
// ============================================================

app.get(
    "/api/notifications/check-user",
    async (req, res) => {

        try {

            const externalId =
                String(
                    req.query.externalId ||
                    ""
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

                    externalId,

                    error:
                        "এই Firebase UID-এর সাথে OneSignal user পাওয়া যায়নি।",

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

            console.error(
                "check-user error:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    error?.message ||
                    "User check failed."
            });
        }

    }
);


// ============================================================
// GET USER IDENTITY
// ============================================================

app.get(
    "/api/notifications/find-user",
    async (req, res) => {

        try {

            const externalId =
                String(
                    req.query.externalId ||
                    ""
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
                    )}/identity`
                );


            if (!result.response.ok) {

                return res.status(
                    result.response.status
                ).json({

                    success: false,

                    found: false,

                    externalId,

                    error:
                        "OneSignal identity পাওয়া যায়নি।",

                    onesignal:
                        result.data
                });
            }


            return res.json({

                success: true,

                found: true,

                externalId,

                identity:
                    result.data

            });


        } catch (error) {

            return res.status(500).json({

                success: false,

                error:
                    error?.message ||
                    "Identity lookup failed."
            });
        }

    }
);


// ============================================================
// GET USER BY SUBSCRIPTION ID
// ============================================================

app.get(
    "/api/notifications/find-user-by-subscription",
    async (req, res) => {

        try {

            const subscriptionId =
                String(
                    req.query.subscriptionId ||
                    ""
                ).trim();


            if (!subscriptionId) {

                return res.status(400).json({

                    success: false,

                    error:
                        "subscriptionId দিন।"
                });
            }


            const result =
                await oneSignalRequest(
                    `/apps/${encodeURIComponent(
                        ONESIGNAL_APP_ID
                    )}/subscriptions/${encodeURIComponent(
                        subscriptionId
                    )}/user/identity`
                );


            if (!result.response.ok) {

                return res.status(
                    result.response.status
                ).json({

                    success: false,

                    found: false,

                    error:
                        "এই Subscription ID-এর user পাওয়া যায়নি।",

                    onesignal:
                        result.data
                });
            }


            return res.json({

                success: true,

                found: true,

                subscriptionId,

                identity:
                    result.data?.identity ||
                    result.data

            });


        } catch (error) {

            return res.status(500).json({

                success: false,

                error:
                    error?.message ||
                    "Subscription lookup failed."
            });
        }

    }
);


// ============================================================
// SEND NOTIFICATION
//
// mode:
//   all
//   user
//   subscription
//
// user:
//   externalId = Firebase UID
//
// subscription:
//   subscriptionId = OneSignal subscription ID
// ============================================================

app.post(
    "/api/notifications/send",
    async (req, res) => {

        try {

            const {

                title,

                message,

                link,

                mode,

                externalId,

                subscriptionId

            } = req.body || {};


            const cleanTitle =
                String(
                    title || ""
                ).trim();


            const cleanMessage =
                String(
                    message || ""
                ).trim();


            const cleanLink =
                String(
                    link || ""
                ).trim();


            const sendMode =
                String(
                    mode ||
                    "all"
                ).trim().toLowerCase();


            if (!cleanTitle) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Notification title required."
                });
            }


            if (!cleanMessage) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Notification message required."
                });
            }


            // ------------------------------------------------
            // BASE PAYLOAD
            // ------------------------------------------------

            const notification = {

                app_id:
                    ONESIGNAL_APP_ID,

                headings: {
                    en:
                        cleanTitle
                },

                contents: {
                    en:
                        cleanMessage
                },

                target_channel:
                    "push"
            };


            // ------------------------------------------------
            // OPTIONAL URL
            // ------------------------------------------------

            if (cleanLink) {

                notification.url =
                    cleanLink;
            }


            // ------------------------------------------------
            // ALL USERS
            // ------------------------------------------------

            if (
                sendMode === "all"
            ) {

                notification.included_segments =
                    [
                        "Total Subscriptions"
                    ];
            }


            // ------------------------------------------------
            // SPECIFIC FIREBASE USER
            // ------------------------------------------------

            else if (
                sendMode === "user" ||
                sendMode === "specific"
            ) {

                const uid =
                    String(
                        externalId ||
                        ""
                    ).trim();


                if (!uid) {

                    return res.status(400).json({

                        success: false,

                        error:
                            "Firebase UID / externalId required."
                    });
                }


                // --------------------------------------------
                // First verify the OneSignal user exists.
                // --------------------------------------------

                const lookup =
                    await oneSignalRequest(
                        `/apps/${encodeURIComponent(
                            ONESIGNAL_APP_ID
                        )}/users/by/external_id/${encodeURIComponent(
                            uid
                        )}`
                    );


                if (
                    !lookup.response.ok
                ) {

                    return res.status(404).json({

                        success: false,

                        found: false,

                        externalId:
                            uid,

                        error:
                            "এই Firebase UID-এর সাথে কোনো OneSignal user পাওয়া যায়নি। প্রথমে user-কে Median APK-তে login করতে হবে।",

                        onesignal:
                            lookup.data
                    });
                }


                // --------------------------------------------
                // User-centric targeting
                // --------------------------------------------

                notification.include_aliases = {

                    external_id: [
                        uid
                    ]
                };


            }


            // ------------------------------------------------
            // SPECIFIC SUBSCRIPTION
            // ------------------------------------------------

            else if (
                sendMode ===
                "subscription"
            ) {

                const sid =
                    String(
                        subscriptionId ||
                        ""
                    ).trim();


                if (!sid) {

                    return res.status(400).json({

                        success: false,

                        error:
                            "subscriptionId required."
                    });
                }


                notification.include_subscription_ids =
                    [
                        sid
                    ];
            }


            // ------------------------------------------------
            // INVALID MODE
            // ------------------------------------------------

            else {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid notification mode. Use all, user or subscription."
                });
            }


            // ------------------------------------------------
            // SEND TO ONESIGNAL
            // ------------------------------------------------

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


            if (
                !result.response.ok
            ) {

                console.error(
                    "OneSignal send error:",
                    result.data
                );


                return res.status(
                    result.response.status
                ).json({

                    success: false,

                    error:
                        "OneSignal notification send failed.",

                    onesignal:
                        result.data
                });
            }


            return res.json({

                success: true,

                mode:
                    sendMode,

                externalId:
                    externalId ||
                    null,

                subscriptionId:
                    subscriptionId ||
                    null,

                onesignal:
                    result.data
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
                    "Notification server error."
            });
        }

    }
);


// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `AURA Notification Server running on port ${PORT}`
        );

    }
);
