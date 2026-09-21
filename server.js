const express = require("express");
const path = require("path");

const app = express();

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});
// ============================================================
// CONFIG
// ============================================================

const PORT = process.env.PORT || 10000;

const ONESIGNAL_APP_ID =
    "b4420740-b9f6-4de7-8792-f6302ad38e4d";

const ONESIGNAL_REST_API_KEY =
    process.env.ONESIGNAL_REST_API_KEY;

const ONESIGNAL_API =
    "https://api.onesignal.com";


// ============================================================
// STATIC FILES
// ============================================================

app.use(
    express.static(__dirname)
);


// ============================================================
// HOME
// IMPORTANT: Main URL opens index.html
// ============================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "index.html"
        )
    );

});


// ============================================================
// HEALTH
// ============================================================

app.get("/health", (req, res) => {

    res.json({

        success: true,

        message:
            "AURA ARMAN TOUR Notification Server is running."

    });

});


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


    const response =
        await fetch(
            ONESIGNAL_API + endpoint,
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


    const text =
        await response.text();


    let data;


    try {

        data =
            text
                ? JSON.parse(text)
                : {};

    } catch {

        data = {

            raw:
                text

        };

    }


    return {

        ok:
            response.ok,

        status:
            response.status,

        data

    };

}


// ============================================================
// CHECK USER
// ============================================================

app.post(
    "/api/notifications/check-user",
    async (req, res) => {

        try {

            const externalId =
                String(
                    req.body.externalId || ""
                ).trim();


            if (!externalId) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Firebase UID / External ID is required."

                });

            }


            const result =
                await oneSignalRequest(

                    `/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(externalId)}`

                );


            if (!result.ok) {

                return res.status(
                    result.status || 404
                ).json({

                    success: false,

                    error:
                        "User not found in OneSignal.",

                    onesignal:
                        result.data

                });

            }


            const user =
                result.data;


            let subscriptions =
                [];


            if (
                Array.isArray(
                    user.subscriptions
                )
            ) {

                subscriptions =
                    user.subscriptions;

            }


            const activeSubscriptions =
                subscriptions.filter(
                    subscription => {

                        return (
                            subscription
                                .enabled !== false
                        );

                    }
                );


            return res.json({

                success: true,

                externalId,

                subscribed:
                    activeSubscriptions.length > 0,

                subscriptionCount:
                    activeSubscriptions.length,

                subscriptions:
                    activeSubscriptions.map(
                        subscription => ({

                            id:
                                subscription.id,

                            type:
                                subscription.type,

                            enabled:
                                subscription.enabled

                        })
                    )

            });


        } catch (error) {

            console.error(
                "CHECK USER ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "User check failed."

            });

        }

    }
);


// ============================================================
// FIND USER
// ============================================================

app.get(
    "/api/notifications/find-user",
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
                        "External ID is required."

                });

            }


            const result =
                await oneSignalRequest(

                    `/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(externalId)}`

                );


            return res.status(
                result.ok
                    ? 200
                    : result.status
            ).json({

                success:
                    result.ok,

                onesignal:
                    result.data

            });


        } catch (error) {

            return res.status(500).json({

                success: false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// FIND USER BY SUBSCRIPTION
// ============================================================

app.get(
    "/api/notifications/find-user-by-subscription",
    async (req, res) => {

        try {

            const subscriptionId =
                String(
                    req.query.subscriptionId || ""
                ).trim();


            if (!subscriptionId) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Subscription ID is required."

                });

            }


            const result =
                await oneSignalRequest(

                    `/apps/${ONESIGNAL_APP_ID}/subscriptions/${encodeURIComponent(subscriptionId)}/user/identity`

                );


            return res.status(
                result.ok
                    ? 200
                    : result.status
            ).json({

                success:
                    result.ok,

                onesignal:
                    result.data

            });


        } catch (error) {

            return res.status(500).json({

                success: false,

                error:
                    error.message

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

                target = "all",

                externalId = "",

                title = "",

                message = "",

                icon = "",

                image = "",

                url = ""

            } = req.body;


            const cleanTitle =
                String(title).trim();


            const cleanMessage =
                String(message).trim();


            const cleanExternalId =
                String(externalId).trim();


            const cleanIcon =
                String(icon).trim();


            const cleanImage =
                String(image).trim();


            const cleanUrl =
                String(url).trim();


            // ------------------------------------------------
            // VALIDATION
            // ------------------------------------------------

            if (!cleanTitle) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Notification title is required."

                });

            }


            if (!cleanMessage) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Notification message is required."

                });

            }


            if (
                target === "specific" &&
                !cleanExternalId
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Firebase UID / External ID is required."

                });

            }


            // ------------------------------------------------
            // BASE PAYLOAD
            // ------------------------------------------------

            const payload = {

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
            // ICON
            // ------------------------------------------------

            if (cleanIcon) {

                payload.chrome_web_icon =
                    cleanIcon;

                payload.small_icon =
                    cleanIcon;

                payload.ios_attachments = {

                    id:
                        cleanIcon

                };

            }


            // ------------------------------------------------
            // BIG IMAGE
            // ------------------------------------------------

            if (cleanImage) {

                payload.big_picture =
                    cleanImage;

                payload.ios_attachments = {

                    ...(payload.ios_attachments || {}),

                    image:
                        cleanImage

                };

            }


            // ------------------------------------------------
            // CLICK URL
            // ------------------------------------------------

            if (cleanUrl) {

                payload.url =
                    cleanUrl;

            }


            // ------------------------------------------------
            // TARGET: ALL USERS
            // ------------------------------------------------

            if (target === "all") {

                payload.included_segments = [

                    "Total Subscriptions"

                ];

            }


            // ------------------------------------------------
            // TARGET: SPECIFIC USER
            // ------------------------------------------------

            else if (
                target === "specific"
            ) {

                const userResult =
                    await oneSignalRequest(

                        `/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(cleanExternalId)}`

                    );


                if (!userResult.ok) {

                    return res.status(404).json({

                        success: false,

                        error:
                            "User not found in OneSignal.",

                        onesignal:
                            userResult.data

                    });

                }


                payload.include_aliases = {

                    external_id: [

                        cleanExternalId

                    ]

                };

            }


            else {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid notification target."

                });

            }


            // ------------------------------------------------
            // SEND TO ONESIGNAL
            // ------------------------------------------------

            const result =
                await oneSignalRequest(

                    "/notifications",

                    {

                        method:
                            "POST",

                        body:
                            JSON.stringify(
                                payload
                            )

                    }

                );


            if (!result.ok) {

                return res.status(
                    result.status || 500
                ).json({

                    success: false,

                    error:
                        "OneSignal notification failed.",

                    onesignal:
                        result.data

                });

            }


            // ------------------------------------------------
            // SUCCESS
            // ------------------------------------------------

            return res.json({

                success: true,

                message:
                    "Notification sent successfully.",

                target,

                externalId:
                    cleanExternalId || null,

                onesignal:
                    result.data

            });


        } catch (error) {

            console.error(
                "SEND NOTIFICATION ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Notification sending failed."

            });

        }

    }
);


// ============================================================
// 404
// ============================================================

app.use(
    (req, res) => {

        res.status(404).json({

            success: false,

            error:
                "Route not found."

        });

    }
);


// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    () => {

        console.log(
            `AURA ARMAN TOUR Notification Server running on port ${PORT}`
        );

    }
);
