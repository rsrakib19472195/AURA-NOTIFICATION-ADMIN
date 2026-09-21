// firebase.js
// ============================================================
// AURA / GAME CHANGER - FIREBASE + ONESIGNAL
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


// ============================================================
// FIREBASE CONFIG
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyA2wYMZAMx6p2GRC21KGgsHgiCoVz--81A",
    authDomain: "aura-arman-tour.firebaseapp.com",
    databaseURL: "https://aura-arman-tour-default-rtdb.firebaseio.com",
    projectId: "aura-arman-tour",
    storageBucket: "aura-arman-tour.firebasestorage.app",
    messagingSenderId: "502326798792",
    appId: "1:502326798792:web:2afd27cb9cd44da48cb8fd"
};


// ============================================================
// FIREBASE INITIALIZE
// ============================================================

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);


// ============================================================
// DEFAULT PROFILE PHOTO
// ============================================================

export const DEFAULT_PROFILE_PHOTO =
    "https://videotourl.com/images/1789800604014-b96e1edf-d789-4513-8557-9fb63a327a13.jpg";


// ============================================================
// ADMIN
// ============================================================

export const ADMIN_EMAIL =
    "teamgamechangerofficial@gmail.com";


// ============================================================
// ONESIGNAL
// ============================================================

export const ONESIGNAL_APP_ID =
    "b4420740-b9f6-4de7-8792-f6302ad38e4d";


let oneSignalReadyPromise = null;


// ============================================================
// LOAD / INITIALIZE ONESIGNAL
// ============================================================

export function initOneSignal() {

    if (oneSignalReadyPromise) {
        return oneSignalReadyPromise;
    }


    oneSignalReadyPromise = new Promise((resolve) => {

        let finished = false;

        const finish = (value) => {

            if (finished) {
                return;
            }

            finished = true;

            resolve(value);
        };


        // ----------------------------------------------------
        // TIMEOUT
        // ----------------------------------------------------

        const timeout = setTimeout(() => {

            console.warn(
                "⚠️ OneSignal SDK timeout."
            );

            finish(
                window.OneSignal || null
            );

        }, 12000);


        // ----------------------------------------------------
        // INITIALIZE
        // ----------------------------------------------------

        const initializeOneSignal = async (OneSignal) => {

            try {

                console.log(
                    "🔄 OneSignal object received."
                );


                if (!OneSignal) {

                    console.warn(
                        "❌ OneSignal object পাওয়া যায়নি."
                    );

                    clearTimeout(timeout);

                    finish(null);

                    return;
                }


                // ------------------------------------------------
                // ALREADY AVAILABLE
                // ------------------------------------------------

                if (
                    OneSignal.User &&
                    OneSignal.Notifications
                ) {

                    console.log(
                        "✅ OneSignal already available."
                    );

                    clearTimeout(timeout);

                    finish(OneSignal);

                    return;
                }


                // ------------------------------------------------
                // INIT
                // ------------------------------------------------

                await OneSignal.init({

                    appId: ONESIGNAL_APP_ID

                });


                console.log(
                    "✅ OneSignal initialized successfully."
                );


                clearTimeout(timeout);

                finish(OneSignal);


            } catch (error) {

                console.error(
                    "❌ OneSignal initialization error:",
                    error
                );

                clearTimeout(timeout);

                finish(null);

            }

        };


        // ----------------------------------------------------
        // SDK ALREADY LOADED
        // ----------------------------------------------------

        if (window.OneSignal) {

            initializeOneSignal(
                window.OneSignal
            );

            return;
        }


        // ----------------------------------------------------
        // DEFERRED QUEUE
        // ----------------------------------------------------

        window.OneSignalDeferred =
            window.OneSignalDeferred || [];


        window.OneSignalDeferred.push(
            initializeOneSignal
        );


        // ----------------------------------------------------
        // LOAD SDK IF NOT PRESENT
        // ----------------------------------------------------

        let script =
            document.querySelector(
                'script[src*="OneSignalSDK.page.js"]'
            );


        if (!script) {

            script =
                document.createElement("script");

            script.src =
                "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";

            script.defer = true;

            script.onload = () => {

                console.log(
                    "✅ OneSignal SDK script loaded."
                );

            };


            script.onerror = () => {

                console.error(
                    "❌ OneSignal SDK script failed to load."
                );

                clearTimeout(timeout);

                finish(null);

            };


            document.head.appendChild(script);

        }

    });


    return oneSignalReadyPromise;
}


// ============================================================
// PUSH SUPPORT
// ============================================================

export async function isOneSignalPushSupported() {

    try {

        const OneSignal =
            await initOneSignal();

        if (!OneSignal) {
            return false;
        }


        if (
            OneSignal.Notifications &&
            typeof OneSignal.Notifications.isPushSupported === "function"
        ) {

            return OneSignal.Notifications.isPushSupported();

        }


        return false;

    } catch (error) {

        console.warn(
            "OneSignal push support check failed:",
            error
        );

        return false;

    }
}


// ============================================================
// PERMISSION STATUS
// ============================================================

export async function getOneSignalPermissionStatus() {

    try {

        const OneSignal =
            await initOneSignal();

        if (!OneSignal) {
            return null;
        }


        return (
            OneSignal.Notifications?.permission ??
            null
        );

    } catch (error) {

        console.warn(
            "Permission status error:",
            error
        );

        return null;

    }
}


// ============================================================
// REQUEST NOTIFICATION PERMISSION
// ============================================================

export async function requestOneSignalPermission() {

    try {

        const OneSignal =
            await initOneSignal();

        if (!OneSignal) {

            console.warn(
                "❌ OneSignal unavailable."
            );

            return false;
        }


        if (
            OneSignal.Notifications &&
            typeof OneSignal.Notifications.requestPermission === "function"
        ) {

            await OneSignal.Notifications.requestPermission();

            return true;
        }


        return false;

    } catch (error) {

        console.error(
            "❌ Notification permission error:",
            error
        );

        return false;

    }
}


// ============================================================
// LINK FIREBASE USER → ONESIGNAL
// ============================================================

export async function linkOneSignalUser(user) {

    if (!user?.uid) {

        console.warn(
            "⚠️ Firebase user পাওয়া যায়নি."
        );

        return false;
    }


    const uid =
        String(user.uid);


    try {

        console.log(
            "================================"
        );

        console.log(
            "🔗 OneSignal linking শুরু"
        );

        console.log(
            "Firebase UID:",
            uid
        );

        console.log(
            "================================"
        );


        const OneSignal =
            await initOneSignal();


        if (!OneSignal) {

            console.warn(
                "⚠️ OneSignal unavailable."
            );

            return false;
        }


        // ----------------------------------------------------
        // IMPORTANT
        // ----------------------------------------------------

        await OneSignal.login(uid);


        console.log(
            "✅ OneSignal.login() completed"
        );


        // একটু সময় দিই identity sync হওয়ার জন্য
        await new Promise(
            resolve =>
                setTimeout(resolve, 2000)
        );


        const externalId =
            OneSignal.User?.externalId ||
            null;


        const oneSignalId =
            OneSignal.User?.onesignalId ||
            null;


        const subscriptionId =
            OneSignal.User?.PushSubscription?.id ||
            null;


        const optedIn =
            OneSignal.User?.PushSubscription?.optedIn ??
            null;


        console.log(
            "================================"
        );

        console.log(
            "📌 ONESIGNAL RESULT"
        );

        console.log(
            "Firebase UID:",
            uid
        );

        console.log(
            "External ID:",
            externalId
        );

        console.log(
            "OneSignal User ID:",
            oneSignalId
        );

        console.log(
            "Subscription ID:",
            subscriptionId
        );

        console.log(
            "Subscribed:",
            optedIn
        );

        console.log(
            "================================"
        );


        return externalId === uid;

    } catch (error) {

        console.error(
            "❌ OneSignal linking failed:",
            error
        );

        return false;

    }
}


// ============================================================
// GET EXTERNAL ID
// ============================================================

export async function getOneSignalExternalId() {

    try {

        const OneSignal =
            await initOneSignal();


        if (!OneSignal) {
            return null;
        }


        return (
            OneSignal.User?.externalId ||
            null
        );

    } catch (error) {

        console.warn(
            "External ID error:",
            error
        );

        return null;

    }
}


// ============================================================
// GET ONESIGNAL USER ID
// ============================================================

export async function getOneSignalUserId() {

    try {

        const OneSignal =
            await initOneSignal();


        if (!OneSignal) {
            return null;
        }


        return (
            OneSignal.User?.onesignalId ||
            null
        );

    } catch (error) {

        console.warn(
            "OneSignal User ID error:",
            error
        );

        return null;

    }
}


// ============================================================
// GET SUBSCRIPTION ID
// ============================================================

export async function getOneSignalSubscriptionId() {

    try {

        const OneSignal =
            await initOneSignal();


        if (!OneSignal) {
            return null;
        }


        return (
            OneSignal.User?.PushSubscription?.id ||
            null
        );

    } catch (error) {

        console.warn(
            "Subscription ID error:",
            error
        );

        return null;

    }
}


// ============================================================
// DEBUG INFORMATION
// ============================================================

export async function getOneSignalDebugInfo() {

    try {

        const OneSignal =
            await initOneSignal();


        if (!OneSignal) {

            return {

                firebaseUid:
                    auth.currentUser?.uid || null,

                externalId: null,

                oneSignalId: null,

                subscriptionId: null,

                optedIn: null,

                permission: null,

                permissionNative: null,

                pushSupported: false,

                sdk: "NOT AVAILABLE"

            };

        }


        let pushSupported = false;


        try {

            if (
                typeof OneSignal.Notifications
                    ?.isPushSupported === "function"
            ) {

                pushSupported =
                    OneSignal.Notifications.isPushSupported();

            }

        } catch (e) {

            pushSupported = false;

        }


        return {

            firebaseUid:
                auth.currentUser?.uid || null,

            externalId:
                OneSignal.User?.externalId || null,

            oneSignalId:
                OneSignal.User?.onesignalId || null,

            subscriptionId:
                OneSignal.User?.PushSubscription?.id || null,

            optedIn:
                OneSignal.User?.PushSubscription?.optedIn ?? null,

            permission:
                OneSignal.Notifications?.permission ?? null,

            permissionNative:
                OneSignal.Notifications?.permissionNative ?? null,

            pushSupported,

            sdk: "AVAILABLE"

        };

    } catch (error) {

        console.error(
            "Debug information error:",
            error
        );


        return {

            firebaseUid:
                auth.currentUser?.uid || null,

            externalId: null,

            oneSignalId: null,

            subscriptionId: null,

            optedIn: null,

            permission: null,

            permissionNative: null,

            pushSupported: false,

            sdk: "ERROR"

        };

    }
}


// ============================================================
// LOGOUT ONESIGNAL USER
// ============================================================

export async function logoutOneSignalUser() {

    try {

        const OneSignal =
            await initOneSignal();


        if (!OneSignal) {
            return false;
        }


        if (
            typeof OneSignal.logout === "function"
        ) {

            await OneSignal.logout();

            console.log(
                "✅ OneSignal logout completed."
            );

            return true;
        }


        return false;

    } catch (error) {

        console.warn(
            "OneSignal logout error:",
            error
        );

        return false;

    }
}