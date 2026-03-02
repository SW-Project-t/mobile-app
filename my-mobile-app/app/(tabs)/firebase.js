import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAP4_nh57EhuGClSsh0ppNsoEocN6aX1tY",
  authDomain: "yallaclass-5cc62.firebaseapp.com",
  projectId: "yallaclass-5cc62",
  storageBucket: "yallaclass-5cc62.firebasestorage.app",
  messagingSenderId: "95693472051",
  appId: "1:95693472051:web:3367f07c07eadee6af3e46",
  measurementId: "G-Y8Z0M894WS"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);