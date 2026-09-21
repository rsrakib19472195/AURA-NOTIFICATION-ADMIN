const express = require("express");

const app = express();

app.use(
    express.json({
        limit: "1mb"
    })
);

app.use(
    express.static(__dirname)
);


const PORT =
    process.env.PORT || 3000;


const ONESIGNAL_APP_ID =
    process.env.ONESIGNAL_APP_ID ||
    "b4420740-b9f6-4de7-8792-f6302ad38e4d";


const ONESIGNAL_REST_API_KEY =
    process.env.ONESIGNAL_REST_API_KEY;


/* ============================================================
   ONESIGNAL REQUEST HELPER
============================================================ */

async function oneSignalRequest(
    path,
    options = {}
) {

    const response =
        await fetch(
            `https://api.onesignal.com${path}`,
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

        data =
            rawText
                ? JSON.parse(rawText)
                : {};

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


/* ============================================================
   FIND ONESIGNAL USER
   BY FIREBASE UID / EXTERNAL ID
============================================================ */

async function findOneSignalUser(
    externalId
) {

    const encodedId =
        encodeURIComponent(
            String(externalId)
        );


    const result =
        await oneSignalRequest(

            `/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodedId}`,

            {
                method: "GET"
            }

        );


    return result;

}


/* ============================================================
   GET SUBSCRIPTION IDS FROM USER RESPONSE
============================================================ */

function extractSubscriptionIds(
    userData
) {

    const ids = [];


    /*
     * Current OneSignal user response
     */

    if (
        Array.isArray(
            userData?.subscriptions
        )
    ) {

        for (
            const subscription
            of userData.subscriptions
        ) {

            if (
                subscription &&
                subscription.id
            ) {

                /*
                 * Push subscription only.
                 */

                const type =
                    String(
                        subscription.type ||
                        subscription.channel ||
                        ""
                    ).toLowerCase();


                const optedIn =
                    subscription.opted_in;


                /*
                 * Include when it is a push
                 * subscription and active.
                 */

                const isPush =
                    !type ||
                    type === "push";


                const isActive =
                    optedIn !== false &&
                    subscription.enabled !== false &&
                    subscription.invalid_identifier !== true;


                if (
                    isPush &&
                    isActive
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


    /*
     * Some API versions may expose
     * subscription directly.
     */

    if (
        userData?.subscription &&
        userData.subscription.id
    ) {

        ids.push(
            String(
                userData.subscription.id
            )
        );

    }


    /*
     * Remove duplicates
     */

    return [
        ...new Set(ids)
    ];

}


/* ============================================================
   HOME
============================================================ */

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            __dirname +
            "/notification.html"
        );

    }
);


/* ============================================================
   HEALTH CHECK
============================================================ */

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            success: true,

            service:
                "AURA ARMAN TOUR Notification Admin",

            onesignal:
                Boolean(
                    ONESIGNAL_REST_API_KEY
                )

        });

    }
);


/* ============================================================
   CHECK SPECIFIC USER
============================================================ */

app.post(
    "/api/notifications/check-user",
    async (req, res) => {

        try {

            if (
                !ONESIGNAL_REST_API_KEY
            ) {

                return res.status(500).json({

                    success: false,

                    error:
                        "OneSignal REST API Key পাওয়া যায়নি।"

                });

            }


            const externalId =
                String(
                    req.body?.externalId ||
                    ""
                ).trim();


            if (!externalId) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Firebase UID দিন।"

                });

            }


            const {
                response,
                data
            } =
                await findOneSignalUser(
                    externalId
                );


            console.log(
                "🔎 OneSignal user lookup:",
                externalId
            );


            console.log(
                JSON.stringify(
                    data,
                    null,
                    2
                )
            );


            if (
                response.status === 404
            ) {

                return res.status(404).json({

                    success: false,

                    subscribed: false,

                    error:
                        "এই Firebase UID-এর সাথে কোনো OneSignal user পাওয়া যায়নি। User-কে app-এ login করে OneSignal subscription তৈরি করতে হবে।"

                });

            }


            if (!response.ok) {

                return res.status(
                    response.status
                ).json({

                    success: false,

                    error:
                        data?.message ||
                        data?.errors?.join?.(", ") ||
                        "OneSignal user lookup failed.",

                    onesignal:
                        data

                });

            }


            const subscriptionIds =
                extractSubscriptionIds(
                    data
                );


            return res.json({

                success: true,

                subscribed:
                    subscriptionIds.length > 0,

                externalId,

                subscriptionCount:
                    subscriptionIds.length,

                subscriptionIds,

                onesignal:
                    data

            });


        } catch (error) {

            console.error(
                "❌ Check user error:",
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


/* ============================================================
   SEND NOTIFICATION
============================================================ */

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

            } =
                req.body;


            /* =================================================
               API KEY
            ================================================= */

            if (
                !ONESIGNAL_REST_API_KEY
            ) {

                return res.status(500).json({

                    success: false,

                    error:
                        "OneSignal REST API Key পাওয়া যায়নি।"

                });

            }


            /* =================================================
               VALIDATION
            ================================================= */

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


            /* =================================================
               BASE NOTIFICATION
            ================================================= */

            const notification = {

                app_id:
                    ONESIGNAL_APP_ID,

                target_channel:
                    "push",

                headings: {

                    en:
                        String(
                            title
                        ).trim()

                },

                contents: {

                    en:
                        String(
                            message
                        ).trim()

                }

            };


            /* =================================================
               ICON
            ================================================= */

            if (
                icon &&
                String(icon).trim()
            ) {

                notification.chrome_web_icon =
                    String(
                        icon
                    ).trim();


                notification.chrome_web_badge =
                    String(
                        icon
                    ).trim();

            }


            /* =================================================
               IMAGE
            ================================================= */

            if (
                image &&
                String(image).trim()
            ) {

                notification.chrome_web_image =
                    String(
                        image
                    ).trim();


                notification.big_picture =
                    String(
                        image
                    ).trim();

            }


            /* =================================================
               URL
               ONLY url
               NEVER web_url
            ================================================= */

            if (
                url &&
                String(url).trim()
            ) {

                notification.url =
                    String(
                        url
                    ).trim();

            }


            /* =================================================
               TARGET
            ================================================= */


            /*
             * =================================================
             * SPECIFIC SUBSCRIPTION
             * =================================================
             */

            if (
                target === "subscription" &&
                subscriptionId &&
                String(
                    subscriptionId
                ).trim()
            ) {

                notification
                    .include_subscription_ids = [

                        String(
                            subscriptionId
                        ).trim()

                    ];

            }


            /*
             * =================================================
             * SPECIFIC USER
             *
             * Firebase UID → OneSignal External ID
             * → active subscription ID
             * → notification
             * =================================================
             */

            else if (
                target === "specific"
            ) {

                const cleanExternalId =
                    String(
                        externalId ||
                        ""
                    ).trim();


                if (!cleanExternalId) {

                    return res.status(400).json({

                        success: false,

                        error:
                            "Firebase UID দিন।"

                    });

                }


                console.log(
                    "🔎 Finding OneSignal user:",
                    cleanExternalId
                );


                const lookup =
                    await findOneSignalUser(
                        cleanExternalId
                    );


                console.log(
                    "Lookup status:",
                    lookup.response.status
                );


                if (
                    lookup.response.status ===
                    404
                ) {

                    return res.status(404).json({

                        success: false,

                        error:
                            "এই Firebase UID-এর সাথে OneSignal user পাওয়া যায়নি। প্রথমে ওই user-কে app-এ login করে notification subscription তৈরি করতে হবে।",

                        code:
                            "USER_NOT_FOUND"

                    });

                }


                if (
                    !lookup.response.ok
                ) {

                    return res.status(
                        lookup.response.status
                    ).json({

                        success: false,

                        error:
                            lookup.data?.message ||
                            lookup.data?.errors?.join?.(", ") ||
                            "OneSignal user lookup failed.",

                        onesignal:
                            lookup.data

                    });

                }


                const subscriptionIds =
                    extractSubscriptionIds(
                        lookup.data
                    );


                console.log(
                    "Active subscriptions:",
                    subscriptionIds
                );


                if (
                    subscriptionIds.length === 0
                ) {

                    return res.status(400).json({

                        success: false,

                        error:
                            "এই Firebase UID-এর OneSignal user আছে, কিন্তু কোনো active push subscription নেই। User-কে app-এ notification permission/subscription চালু করতে হবে।",

                        code:
                            "NO_ACTIVE_SUBSCRIPTION",

                        externalId:
                            cleanExternalId,

                        onesignal:
                            lookup.data

                    });

                }


                /*
                 * OneSignal supports up to 2,000
                 * subscription IDs per request.
                 */

                notification
                    .include_subscription_ids =
                    subscriptionIds.slice(
                        0,
                        2000
                    );

            }


            /*
             * =================================================
             * ALL USERS
             *
             * ORIGINAL WORKING METHOD
             * DO NOT CHANGE
             * =================================================
             */

            else {

                notification
                    .included_segments = [

                        "Total Subscriptions"

                    ];

            }


            /* =================================================
               LOG
            ================================================= */

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


            /* =================================================
               SEND TO ONESIGNAL
            ================================================= */

            const response =
                await fetch(

                    "https://api.onesignal.com/notifications",

                    {

                        method:
                            "POST",

                        headers: {

                            "Content-Type":
                                "application/json",

                            "Authorization":
                                `Key ${ONESIGNAL_REST_API_KEY}`

                        },

                        body:
                            JSON.stringify(
                                notification
                            )

                    }

                );


            const rawText =
                await response.text();


            let data;


            try {

                data =
                    rawText
                        ? JSON.parse(
                            rawText
                        )
                        : {};

            } catch {

                data = {
                    raw:
                        rawText
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


            /* =================================================
               ERROR
            ================================================= */

            if (!response.ok) {

                return res.status(
                    response.status
                ).json({

                    success: false,

                    error:
                        Array.isArray(
                            data?.errors
                        )
                            ? data.errors.join(
                                ", "
                            )
                            : (
                                data?.message ||
                                "OneSignal notification failed."
                            ),

                    onesignal:
                        data

                });

            }


            if (
                Array.isArray(
                    data?.errors
                ) &&
                data.errors.length > 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        data.errors.join(
                            ", "
                        ),

                    onesignal:
                        data

                });

            }


            /* =================================================
               SUCCESS
            ================================================= */

            return res.status(200).json({

                success: true,

                message:
                    "Notification sent successfully!",

                notificationId:
                    data?.id ||
                    null,

                recipients:
                    data?.recipients ||
                    0,

                target:
                    target ||
                    "all",

                onesignal:
                    data

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

    }
);


/* ============================================================
   SERVER START
============================================================ */

app.listen(
    PORT,
    () => {

        console.log(
            `🚀 AURA Notification Admin running on port ${PORT}`
        );

        console.log(
            "OneSignal App ID:",
            ONESIGNAL_APP_ID
        );

        console.log(
            "OneSignal REST API configured:",
            Boolean(
                ONESIGNAL_REST_API_KEY
            )
        );

    }
);
