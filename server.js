const express = require("express");
const path = require("path");
const admin = require("firebase-admin");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 10000;

const ONESIGNAL_APP_ID =
  process.env.ONESIGNAL_APP_ID ||
  "b4420740-b9f6-4de7-8792-f6302ad38e4d";

const ONESIGNAL_REST_API_KEY =
  process.env.ONESIGNAL_REST_API_KEY;

const ONESIGNAL_API =
  "https://api.onesignal.com";

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL ||
  "auraskill19@gmail.com";

const ADMIN_EXTERNAL_ID =
  String(
    process.env.ADMIN_ONESIGNAL_EXTERNAL_ID || ""
  ).trim();

const DEFAULT_ICON =
  "https://videotourl.com/images/1789792991627-2a906ffa-fbc0-4f79-9d9b-8dddb80ca667.jpg";

let firebaseReady = false;
let firestore = null;
let firebaseAuth = null;


/* =========================================================
   FIREBASE ADMIN
========================================================= */

function initFirebaseAdmin() {
  if (firebaseReady) return true;

  try {
    if (!admin.apps.length) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const serviceAccount = JSON.parse(
          process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        );

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId:
            process.env.FIREBASE_PROJECT_ID ||
            serviceAccount.project_id
        });

      } else if (
        process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY
      ) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId:
              process.env.FIREBASE_PROJECT_ID,

            clientEmail:
              process.env.FIREBASE_CLIENT_EMAIL,

            privateKey:
              process.env.FIREBASE_PRIVATE_KEY.replace(
                /\\n/g,
                "\n"
              )
          })
        });

      } else {
        console.warn(
          "⚠️ Firebase Admin credentials missing."
        );

        return false;
      }
    }

    firestore = admin.firestore();
    firebaseAuth = admin.auth();

    firebaseReady = true;

    console.log(
      "✅ Firebase Admin initialized."
    );

    return true;

  } catch (error) {
    console.error(
      "❌ Firebase Admin init failed:",
      error.message
    );

    return false;
  }
}


/* =========================================================
   ONESIGNAL REQUEST
========================================================= */

async function oneSignalRequest(
  endpoint,
  options = {}
) {
  if (!ONESIGNAL_REST_API_KEY) {
    throw new Error(
      "ONESIGNAL_REST_API_KEY environment variable is missing."
    );
  }

  const response = await fetch(
    ONESIGNAL_API + endpoint,
    {
      ...options,

      headers: {
        "Content-Type": "application/json",

        Authorization:
          `Key ${ONESIGNAL_REST_API_KEY}`,

        ...(options.headers || {})
      }
    }
  );

  const text = await response.text();

  let data = {};

  try {
    data = text
      ? JSON.parse(text)
      : {};
  } catch {
    data = {
      raw: text
    };
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}


/* =========================================================
   ADMIN EXTERNAL ID
========================================================= */

async function getAdminExternalId() {
  if (ADMIN_EXTERNAL_ID) {
    return ADMIN_EXTERNAL_ID;
  }

  if (!initFirebaseAdmin()) {
    throw new Error(
      "Set ADMIN_ONESIGNAL_EXTERNAL_ID or Firebase Admin credentials."
    );
  }

  const user =
    await firebaseAuth.getUserByEmail(
      ADMIN_EMAIL
    );

  return user.uid;
}


/* =========================================================
   SCHEDULE
========================================================= */

function normalizeScheduleDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Invalid scheduled date/time."
    );
  }

  return date;
}


function getScheduleInfo(value) {
  const date =
    normalizeScheduleDate(value);

  if (!date) {
    return {
      scheduled: false,
      date: null
    };
  }

  if (date.getTime() <= Date.now()) {
    throw new Error(
      "Scheduled time must be in the future."
    );
  }

  return {
    scheduled: true,
    date
  };
}


/* =========================================================
   FIRESTORE HISTORY
========================================================= */

async function saveNotificationRecord(data) {
  if (!initFirebaseAdmin()) {
    return null;
  }

  try {
    const ref =
      firestore
        .collection("notificationHistory")
        .doc();

    await ref.set({
      ...data,

      createdAt:
        admin.firestore
          .FieldValue
          .serverTimestamp(),

      createdAtMs:
        Date.now()
    });

    return ref.id;

  } catch (error) {
    console.error(
      "Notification history save failed:",
      error.message
    );

    return null;
  }
}


/* =========================================================
   NOTIFICATION PAYLOAD
========================================================= */

function makeManualNotificationPayload({
  target,
  externalId,
  title,
  message,
  icon,
  image,
  url,
  scheduledAt
}) {
  const payload = {
    app_id:
      ONESIGNAL_APP_ID,

    target_channel:
      "push",

    headings: {
      en: title
    },

    contents: {
      en: message
    },

    data: {
      targetUrl:
        url || "/notification.html",

      source:
        "aura-arman-manual",

      scheduledAt:
        scheduledAt
          ? new Date(
              scheduledAt
            ).toISOString()
          : null
    }
  };


  /* TARGET */

  if (target === "all") {
    payload.included_segments = [
      "Total Subscriptions"
    ];

  } else if (target === "specific") {
    payload.include_aliases = {
      external_id: [
        externalId
      ]
    };
  }


  /* ICON */

  if (icon) {
    payload.small_icon = icon;

    payload.chrome_web_icon = icon;
  }


  /* IMAGE */

  if (image) {
    payload.big_picture = image;

    payload.ios_attachments = {
      image
    };
  }


  /* SERVER-SIDE SCHEDULE */

  if (scheduledAt) {
    payload.send_after =
      new Date(
        scheduledAt
      ).toISOString();
  }


  return payload;
}


/* =========================================================
   ADMIN PUSH
========================================================= */

async function sendAdminPush({
  type,
  requestId,
  data
}) {
  const externalId =
    await getAdminExternalId();

  const isDeposit =
    type === "deposit";

  const amount =
    Number(
      data.amount || 0
    );

  const user =
    data.userName ||
    data.username ||
    data.userEmail ||
    data.email ||
    data.userId ||
    data.uid ||
    "User";

  const method =
    data.gateway ||
    data.method ||
    "";

  const title =
    isDeposit
      ? "নতুন Deposit Request"
      : "নতুন Withdraw Request";

  const message =
    `${user} ${
      isDeposit
        ? "ডিপোজিট"
        : "উইথড্র"
    } রিকোয়েস্ট করেছে` +
    (
      amount
        ? ` — ৳${amount}`
        : ""
    ) +
    (
      method
        ? ` (${method})`
        : ""
    );

  const payload =
    makeManualNotificationPayload({
      target:
        "specific",

      externalId,

      title,

      message,

      icon:
        DEFAULT_ICON,

      url:
        "/notification.html"
    });


  const result =
    await oneSignalRequest(
      "/notifications",
      {
        method: "POST",

        body:
          JSON.stringify(
            payload
          )
      }
    );


  if (!result.ok) {
    throw new Error(
      `OneSignal failed (${result.status}): ` +
      JSON.stringify(
        result.data
      )
    );
  }


  if (initFirebaseAdmin()) {
    await firestore
      .collection(
        "adminNotifications"
      )
      .doc(
        `${type}_${requestId}`
      )
      .set(
        {
          type,

          title,

          message,

          requestId:
            String(requestId),

          userName:
            user,

          amount,

          method,

          status:
            "unread",

          createdAt:
            Date.now(),

          pushSent:
            true,

          onesignalMessageId:
            result.data?.id ||
            result.data?.notification_id ||
            null
        },
        {
          merge: true
        }
      );
  }

  return result.data;
}


/* =========================================================
   PENDING HELPERS
========================================================= */

function isPending(value) {
  return (
    String(
      value ?? "pending"
    ).toLowerCase() ===
    "pending"
  );
}


function looksLikeDeposit(data) {
  return (
    data?.type === "Deposit" ||

    !!data?.gateway ||

    (
      data?.amount != null &&
      !data?.method &&
      !data?.withdraw
    )
  );
}


/* =========================================================
   CLAIM + SEND
========================================================= */

async function claimAndSend(
  type,
  requestId,
  data
) {
  if (!initFirebaseAdmin()) {
    return;
  }

  const claimRef =
    firestore
      .collection("adminPushSent")
      .doc(
        `${type}_${requestId}`
      );


  const claimed =
    await firestore.runTransaction(
      async tx => {
        const snap =
          await tx.get(
            claimRef
          );

        if (snap.exists) {
          return false;
        }

        tx.set(
          claimRef,
          {
            type,

            requestId:
              String(requestId),

            createdAt:
              Date.now(),

            status:
              "sending"
          }
        );

        return true;
      }
    );


  if (!claimed) {
    return;
  }


  try {
    const sendResult =
      await sendAdminPush({
        type,
        requestId,
        data
      });


    await claimRef.set(
      {
        status:
          "sent",

        sentAt:
          Date.now(),

        onesignalMessageId:
          sendResult?.id ||
          sendResult?.notification_id ||
          null
      },
      {
        merge: true
      }
    );

  } catch (error) {
    console.error(
      `❌ ${type} push failed:`,
      requestId,
      error.message
    );

    await claimRef.set(
      {
        status:
          "failed",

        error:
          error.message,

        failedAt:
          Date.now()
      },
      {
        merge: true
      }
    );
  }
}


/* =========================================================
   FIRESTORE WATCHERS
========================================================= */

function startFirestoreWatchers() {
  if (!initFirebaseAdmin()) {
    return;
  }

  let depositsReady = false;
  let withdrawsReady = false;


  const handleDepositSnapshot =
    (
      snapshot,
      sourceName
    ) => {

      if (!depositsReady) {
        depositsReady = true;

        console.log(
          `✅ Deposit listener ready (${sourceName}).`
        );

        return;
      }


      snapshot.docChanges()
        .forEach(change => {

          if (
            change.type !== "added"
          ) {
            return;
          }

          const data =
            change.doc.data() ||
            {};


          if (
            !isPending(
              data.status
            )
          ) {
            return;
          }


          if (
            sourceName ===
              "transactions" &&
            !looksLikeDeposit(
              data
            )
          ) {
            return;
          }


          claimAndSend(
            "deposit",
            change.doc.id,
            data
          ).catch(
            console.error
          );
        });
    };


  firestore
    .collection("deposits")
    .onSnapshot(
      snapshot =>
        handleDepositSnapshot(
          snapshot,
          "deposits"
        ),

      error =>
        console.error(
          "Deposits listener error:",
          error
        )
    );


  firestore
    .collection("transactions")
    .onSnapshot(
      snapshot =>
        handleDepositSnapshot(
          snapshot,
          "transactions"
        ),

      error =>
        console.error(
          "Transactions listener error:",
          error
        )
    );


  firestore
    .collection("withdraws")
    .onSnapshot(
      snapshot => {

        if (!withdrawsReady) {
          withdrawsReady = true;

          console.log(
            "✅ Withdraw listener ready."
          );

          return;
        }


        snapshot.docChanges()
          .forEach(change => {

            if (
              change.type !== "added"
            ) {
              return;
            }


            const data =
              change.doc.data() ||
              {};


            if (
              !isPending(
                data.status
              )
            ) {
              return;
            }


            claimAndSend(
              "withdraw",
              change.doc.id,
              data
            ).catch(
              console.error
            );
          });
      },

      error =>
        console.error(
          "Withdraw listener error:",
          error
        )
    );
}


/* =========================================================
   CATCH UP
========================================================= */

async function catchUpRecentRequests() {
  if (!initFirebaseAdmin()) {
    return;
  }

  const cutoff =
    Date.now() -
    15 * 60 * 1000;


  const sources = [
    [
      "deposit",
      "deposits"
    ],
    [
      "deposit",
      "transactions"
    ],
    [
      "withdraw",
      "withdraws"
    ]
  ];


  for (
    const [
      type,
      collectionName
    ] of sources
  ) {

    try {
      const snap =
        await firestore
          .collection(
            collectionName
          )
          .where(
            "status",
            "==",
            "pending"
          )
          .get();


      for (
        const docSnap
        of snap.docs
      ) {

        const data =
          docSnap.data() ||
          {};


        if (
          type === "deposit" &&
          !looksLikeDeposit(
            data
          )
        ) {
          continue;
        }


        const created =
          Number(
            data.createdAt
              ?.toMillis?.() ||
            data.createdAt ||
            data.timestamp
              ?.toMillis?.() ||
            data.timestamp ||
            0
          );


        if (
          created &&
          created < cutoff
        ) {
          continue;
        }


        await claimAndSend(
          type,
          docSnap.id,
          data
        );
      }

    } catch (error) {
      console.error(
        `Catch-up ${type} error:`,
        error.message
      );
    }
  }
}


/* =========================================================
   PAGES
========================================================= */

app.get(
  "/",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);


/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/health",
  (req, res) => {
    res.json({
      success:
        true,

      firebaseAdmin:
        firebaseReady,

      onesignalConfigured:
        Boolean(
          ONESIGNAL_REST_API_KEY
        ),

      message:
        "AURA ARMAN TOUR Notification Server is running."
    });
  }
);


/* =========================================================
   CHECK USER
========================================================= */

app.post(
  "/api/notifications/check-user",
  async (req, res) => {

    try {
      const externalId =
        String(
          req.body.externalId ||
          ""
        ).trim();


      if (!externalId) {
        return res.status(400).json({
          success:
            false,

          error:
            "Firebase UID / External ID is required."
        });
      }


      const result =
        await oneSignalRequest(
          `/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(
            externalId
          )}`
        );


      if (!result.ok) {
        return res.status(
          result.status || 404
        ).json({
          success:
            false,

          error:
            "User not found in OneSignal.",

          onesignal:
            result.data
        });
      }


      const subscriptions =
        Array.isArray(
          result.data?.subscriptions
        )
          ? result.data.subscriptions
          : [];


      const activeSubscriptions =
        subscriptions.filter(
          subscription =>
            subscription.enabled !==
            false
        );


      return res.json({
        success:
          true,

        externalId,

        subscribed:
          activeSubscriptions.length >
          0,

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
        success:
          false,

        error:
          error.message ||
          "User check failed."
      });
    }
  }
);


/* =========================================================
   FIND USER
========================================================= */

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
          success:
            false,

          error:
            "External ID is required."
        });
      }


      const result =
        await oneSignalRequest(
          `/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(
            externalId
          )}`
        );


      return res
        .status(
          result.ok
            ? 200
            : result.status
        )
        .json({
          success:
            result.ok,

          onesignal:
            result.data
        });

    } catch (error) {
      return res.status(500).json({
        success:
          false,

        error:
          error.message
      });
    }
  }
);


/* =========================================================
   SEND / SCHEDULE
========================================================= */

app.post(
  "/api/notifications/send",
  async (req, res) => {

    try {

      const {
        target =
          "all",

        externalId =
          "",

        title =
          "",

        message =
          "",

        icon =
          "",

        image =
          "",

        url =
          "/notification.html",

        scheduledAt =
          null
      } = req.body;


      const cleanTitle =
        String(title).trim();

      const cleanMessage =
        String(message).trim();

      const cleanExternalId =
        String(
          externalId
        ).trim();

      const cleanIcon =
        String(icon
        ).trim();

      const cleanImage =
        String(image
        ).trim();

      const cleanUrl =
        String(url
        ).trim();


      /* VALIDATION */

      if (!cleanTitle) {
        return res.status(400).json({
          success:
            false,

          error:
            "Notification title is required."
        });
      }


      if (!cleanMessage) {
        return res.status(400).json({
          success:
            false,

          error:
            "Notification message is required."
        });
      }


      if (
        target !== "all" &&
        target !== "specific"
      ) {
        return res.status(400).json({
          success:
            false,

          error:
            "Invalid notification target."
        });
      }


      if (
        target === "specific" &&
        !cleanExternalId
      ) {
        return res.status(400).json({
          success:
            false,

          error:
            "Firebase UID / External ID is required."
        });
      }


      /* SCHEDULE */

      const scheduleInfo =
        getScheduleInfo(
          scheduledAt
        );


      /* SPECIFIC USER */

      if (
        target === "specific"
      ) {

        const userResult =
          await oneSignalRequest(
            `/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(
              cleanExternalId
            )}`
          );


        if (!userResult.ok) {
          return res.status(404).json({
            success:
              false,

            error:
              "User not found in OneSignal.",

            onesignal:
              userResult.data
          });
        }
      }


      /* PAYLOAD */

      const payload =
        makeManualNotificationPayload({
          target,

          externalId:
            cleanExternalId,

          title:
            cleanTitle,

          message:
            cleanMessage,

          icon:
            cleanIcon,

          image:
            cleanImage,

          url:
            cleanUrl,

          scheduledAt:
            scheduleInfo.date
        });


      /* ONESIGNAL */

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
          success:
            false,

          error:
            "OneSignal notification failed.",

          onesignal:
            result.data
        });
      }


      /* HISTORY */

      const historyId =
        await saveNotificationRecord({
          target,

          externalId:
            cleanExternalId ||
            null,

          title:
            cleanTitle,

          message:
            cleanMessage,

          icon:
            cleanIcon ||
            null,

          image:
            cleanImage ||
            null,

          url:
            cleanUrl,

          scheduled:
            scheduleInfo.scheduled,

          scheduledAt:
            scheduleInfo.date
              ? scheduleInfo.date.getTime()
              : null,

          status:
            scheduleInfo.scheduled
              ? "scheduled"
              : "sent",

          onesignalMessageId:
            result.data?.id ||
            result.data?.notification_id ||
            null
        });


      return res.json({
        success:
          true,

        message:
          scheduleInfo.scheduled
            ? "Notification scheduled successfully."
            : "Notification sent successfully.",

        scheduled:
          scheduleInfo.scheduled,

        scheduledAt:
          scheduleInfo.date
            ? scheduleInfo.date.toISOString()
            : null,

        target,

        externalId:
          cleanExternalId ||
          null,

        historyId,

        onesignal:
          result.data
      });

    } catch (error) {

      console.error(
        "SEND NOTIFICATION ERROR:",
        error
      );


      return res.status(500).json({
        success:
          false,

        error:
          error.message ||
          "Notification sending failed."
      });
    }
  }
);


/* =========================================================
   404
========================================================= */

app.use(
  (req, res) => {
    res.status(404).json({
      success:
        false,

      error:
        "Route not found."
    });
  }
);


/* =========================================================
   START
========================================================= */

app.listen(
  PORT,
  async () => {

    console.log(
      `AURA ARMAN TOUR Notification Server running on port ${PORT}`
    );


    if (!ONESIGNAL_REST_API_KEY) {
      console.warn(
        "⚠️ ONESIGNAL_REST_API_KEY is missing."
      );
    }


    initFirebaseAdmin();

    await catchUpRecentRequests();

    startFirestoreWatchers();
  }
);
