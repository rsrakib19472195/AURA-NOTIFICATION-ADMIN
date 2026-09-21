const express = require("express");
const path = require("path");
const admin = require("firebase-admin");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 10000;
const ONESIGNAL_APP_ID =
  process.env.ONESIGNAL_APP_ID || "b4420740-b9f6-4de7-8792-f6302ad38e4d";
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const ONESIGNAL_API = "https://api.onesignal.com";
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || "teamgamechangerofficial@gmail.com";
const ADMIN_EXTERNAL_ID = String(
  process.env.ADMIN_ONESIGNAL_EXTERNAL_ID || ""
).trim();

let firebaseReady = false;
let firestore = null;
let firebaseAuth = null;

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
          projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
        });
      } else if (
        process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY
      ) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
          }),
        });
      } else {
        console.warn(
          "⚠️ Firebase Admin credentials missing. Automatic Deposit/Withdraw push is disabled."
        );
        return false;
      }
    }

    firestore = admin.firestore();
    firebaseAuth = admin.auth();
    firebaseReady = true;
    console.log("✅ Firebase Admin initialized.");
    return true;
  } catch (error) {
    console.error("❌ Firebase Admin init failed:", error.message);
    return false;
  }
}

async function oneSignalRequest(endpoint, options = {}) {
  if (!ONESIGNAL_REST_API_KEY) {
    throw new Error("ONESIGNAL_REST_API_KEY environment variable is missing.");
  }

  const response = await fetch(ONESIGNAL_API + endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { ok: response.ok, status: response.status, data };
}

async function getAdminExternalId() {
  if (ADMIN_EXTERNAL_ID) return ADMIN_EXTERNAL_ID;

  if (!initFirebaseAdmin()) {
    throw new Error(
      "Set ADMIN_ONESIGNAL_EXTERNAL_ID or Firebase Admin credentials on Render."
    );
  }

  const user = await firebaseAuth.getUserByEmail(ADMIN_EMAIL);
  return user.uid;
}

function makeNotificationPayload({
  title,
  message,
  targetExternalId,
  targetUrl,
  icon,
}) {
  const payload = {
    app_id: ONESIGNAL_APP_ID,
    target_channel: "push",
    include_aliases: {
      external_id: [targetExternalId],
    },
    headings: { en: title },
    contents: { en: message },
    data: {
      targetUrl: targetUrl || "/notification.html",
      source: "aura-arman-admin",
    },
  };

  if (icon) {
    payload.small_icon = icon;
    payload.chrome_web_icon = icon;
  }

  return payload;
}

async function sendAdminPush({
  type,
  requestId,
  data,
}) {
  const externalId = await getAdminExternalId();
  const isDeposit = type === "deposit";
  const amount = Number(data.amount || 0);
  const user =
    data.userName ||
    data.username ||
    data.userEmail ||
    data.email ||
    data.userId ||
    data.uid ||
    "User";
  const method = data.gateway || data.method || "";

  const title = isDeposit
    ? "নতুন Deposit Request"
    : "নতুন Withdraw Request";

  const message =
    `${user} ${isDeposit ? "ডিপোজিট" : "উইথড্র"} রিকোয়েস্ট করেছে` +
    (amount ? ` — ৳${amount}` : "") +
    (method ? ` (${method})` : "");

  const result = await oneSignalRequest("/notifications", {
    method: "POST",
    body: JSON.stringify(
      makeNotificationPayload({
        title,
        message,
        targetExternalId: externalId,
        targetUrl: "/notification.html",
        icon:
          "https://videotourl.com/images/1789792991627-2a906ffa-fbc0-4f79-9d9b-8dddb80ca667.jpg",
      })
    ),
  });

  if (!result.ok) {
    throw new Error(
      `OneSignal failed (${result.status}): ${JSON.stringify(result.data)}`
    );
  }

  if (initFirebaseAdmin()) {
    await firestore
      .collection("adminNotifications")
      .doc(`${type}_${requestId}`)
      .set(
        {
          type,
          title,
          message,
          requestId: String(requestId),
          userName: user,
          amount,
          method,
          status: "unread",
          createdAt: Date.now(),
          pushSent: true,
          onesignalMessageId:
            result.data?.id || result.data?.notification_id || null,
        },
        { merge: true }
      );
  }

  return result.data;
}

function isPending(value) {
  return String(value ?? "pending").toLowerCase() === "pending";
}

function looksLikeDeposit(data) {
  return (
    data?.type === "Deposit" ||
    !!data?.gateway ||
    (data?.amount != null && !data?.method && !data?.withdraw)
  );
}

async function claimAndSend(type, requestId, data) {
  if (!initFirebaseAdmin()) return;

  const claimRef = firestore
    .collection("adminPushSent")
    .doc(`${type}_${requestId}`);

  const claimed = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(claimRef);
    if (snap.exists) return false;

    tx.set(claimRef, {
      type,
      requestId: String(requestId),
      createdAt: Date.now(),
      status: "sending",
    });
    return true;
  });

  if (!claimed) return;

  try {
    const result = await sendAdminPush({ type, requestId, data });

    await claimRef.set(
      {
        status: "sent",
        sentAt: Date.now(),
        onesignalMessageId:
          result?.id || result?.notification_id || null,
      },
      { merge: true }
    );

    console.log(`🔔 ${type} push sent: ${requestId}`);
  } catch (error) {
    console.error(`❌ ${type} push failed:`, requestId, error.message);

    await claimRef.set(
      {
        status: "failed",
        error: error.message,
        failedAt: Date.now(),
      },
      { merge: true }
    );
  }
}

function startFirestoreWatchers() {
  if (!initFirebaseAdmin()) return;

  let depositsReady = false;
  let withdrawsReady = false;

  const handleDepositSnapshot = (snapshot, sourceName) => {
    if (!depositsReady) {
      depositsReady = true;
      console.log(`✅ Deposit listener ready (${sourceName}).`);
      return;
    }
    snapshot.docChanges().forEach((change) => {
      if (change.type !== "added") return;
      const data = change.doc.data() || {};
      if (!isPending(data.status)) return;
      if (sourceName === "transactions" && !looksLikeDeposit(data)) return;
      claimAndSend("deposit", change.doc.id, data).catch(console.error);
    });
  };

  // Current app: pending deposits are stored in `deposits`.
  firestore.collection("deposits").onSnapshot(
    (snapshot) => handleDepositSnapshot(snapshot, "deposits"),
    (error) => console.error("Deposits collection listener error:", error)
  );

  // Legacy compatibility: some older builds stored deposits in `transactions`.
  firestore.collection("transactions").onSnapshot(
    (snapshot) => handleDepositSnapshot(snapshot, "transactions"),
    (error) => console.error("Transactions deposit listener error:", error)
  );

  firestore.collection("withdraws").onSnapshot(
    (snapshot) => {
      if (!withdrawsReady) {
        withdrawsReady = true;
        console.log("✅ Withdraw listener ready.");
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        const data = change.doc.data() || {};
        if (!isPending(data.status)) return;
        claimAndSend("withdraw", change.doc.id, data).catch(console.error);
      });
    },
    (error) => console.error("Withdraw listener error:", error)
  );
}

// Optional catch-up for requests created shortly before a Render restart.
async function catchUpRecentRequests() {
  if (!initFirebaseAdmin()) return;

  const cutoff = Date.now() - 15 * 60 * 1000;

  for (const [type, collectionName] of [
    ["deposit", "deposits"],
    ["deposit", "transactions"],
    ["withdraw", "withdraws"],
  ]) {
    try {
      const snap = await firestore
        .collection(collectionName)
        .where("status", "==", "pending")
        .get();

      for (const docSnap of snap.docs) {
        const data = docSnap.data() || {};
        if (type === "deposit" && !looksLikeDeposit(data)) continue;

        const created = Number(
          data.createdAt?.toMillis?.() ||
            data.createdAt ||
            data.timestamp?.toMillis?.() ||
            data.timestamp ||
            0
        );

        if (created && created < cutoff) continue;

        await claimAndSend(type, docSnap.id, data);
      }
    } catch (error) {
      console.error(`Catch-up ${type} error:`, error.message);
    }
  }
}

// ============================================================
// PAGES
// ============================================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    firebaseAdmin: firebaseReady,
    onesignalConfigured: Boolean(ONESIGNAL_REST_API_KEY),
    message: "AURA ARMAN TOUR Notification Server is running.",
  });
});

// ============================================================
// MANUAL NOTIFICATION API
// ============================================================
app.post("/api/notifications/check-user", async (req, res) => {
  try {
    const externalId = String(req.body.externalId || "").trim();
    if (!externalId) {
      return res.status(400).json({
        success: false,
        error: "Firebase UID / External ID is required.",
      });
    }

    const result = await oneSignalRequest(
      `/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(
        externalId
      )}`
    );

    if (!result.ok) {
      return res.status(result.status || 404).json({
        success: false,
        error: "User not found in OneSignal.",
        onesignal: result.data,
      });
    }

    const subscriptions = Array.isArray(result.data?.subscriptions)
      ? result.data.subscriptions
      : [];

    const activeSubscriptions = subscriptions.filter(
      (subscription) => subscription.enabled !== false
    );

    return res.json({
      success: true,
      externalId,
      subscribed: activeSubscriptions.length > 0,
      subscriptionCount: activeSubscriptions.length,
      subscriptions: activeSubscriptions.map((subscription) => ({
        id: subscription.id,
        type: subscription.type,
        enabled: subscription.enabled,
      })),
    });
  } catch (error) {
    console.error("CHECK USER ERROR:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "User check failed.",
    });
  }
});

app.get("/api/notifications/find-user", async (req, res) => {
  try {
    const externalId = String(req.query.externalId || "").trim();
    if (!externalId) {
      return res.status(400).json({
        success: false,
        error: "External ID is required.",
      });
    }

    const result = await oneSignalRequest(
      `/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(
        externalId
      )}`
    );

    return res.status(result.ok ? 200 : result.status).json({
      success: result.ok,
      onesignal: result.data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/api/notifications/send", async (req, res) => {
  try {
    const {
      target = "all",
      externalId = "",
      title = "",
      message = "",
      icon = "",
      image = "",
      url = "/notification.html",
    } = req.body;

    const cleanTitle = String(title).trim();
    const cleanMessage = String(message).trim();
    const cleanExternalId = String(externalId).trim();
    const cleanIcon = String(icon).trim();
    const cleanImage = String(image).trim();
    const cleanUrl = String(url).trim();

    if (!cleanTitle) {
      return res.status(400).json({
        success: false,
        error: "Notification title is required.",
      });
    }

    if (!cleanMessage) {
      return res.status(400).json({
        success: false,
        error: "Notification message is required.",
      });
    }

    const payload = {
      app_id: ONESIGNAL_APP_ID,
      target_channel: "push",
      headings: { en: cleanTitle },
      contents: { en: cleanMessage },
      data: {
        targetUrl: cleanUrl || "/notification.html",
        source: "aura-arman-manual",
      },
    };

    if (cleanIcon) {
      payload.small_icon = cleanIcon;
      payload.chrome_web_icon = cleanIcon;
    }

    if (cleanImage) {
      payload.big_picture = cleanImage;
      payload.ios_attachments = { image: cleanImage };
    }

    if (target === "all") {
      payload.included_segments = ["Total Subscriptions"];
    } else if (target === "specific") {
      if (!cleanExternalId) {
        return res.status(400).json({
          success: false,
          error: "Firebase UID / External ID is required.",
        });
      }

      const userResult = await oneSignalRequest(
        `/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(
          cleanExternalId
        )}`
      );

      if (!userResult.ok) {
        return res.status(404).json({
          success: false,
          error: "User not found in OneSignal.",
          onesignal: userResult.data,
        });
      }

      payload.include_aliases = {
        external_id: [cleanExternalId],
      };
    } else {
      return res.status(400).json({
        success: false,
        error: "Invalid notification target.",
      });
    }

    const result = await oneSignalRequest("/notifications", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!result.ok) {
      return res.status(result.status || 500).json({
        success: false,
        error: "OneSignal notification failed.",
        onesignal: result.data,
      });
    }

    return res.json({
      success: true,
      message: "Notification sent successfully.",
      target,
      externalId: cleanExternalId || null,
      onesignal: result.data,
    });
  } catch (error) {
    console.error("SEND NOTIFICATION ERROR:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Notification sending failed.",
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found.",
  });
});

app.listen(PORT, async () => {
  console.log(`AURA ARMAN TOUR Notification Server running on port ${PORT}`);
  if (!ONESIGNAL_REST_API_KEY) {
    console.warn("⚠️ ONESIGNAL_REST_API_KEY is missing.");
  }
  initFirebaseAdmin();
  await catchUpRecentRequests();
  startFirestoreWatchers();
});
