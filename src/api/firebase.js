 
import { initializeApp } from "firebase/app";
import { getDatabase } from 'firebase/database';
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBeU-jXjglCaIpldlBcMak4bQmkVqynB8c",
  authDomain: "ctcpgalatama.firebaseapp.com",
  databaseURL: "https://ctcpgalatama-default-rtdb.firebaseio.com",
  projectId: "ctcpgalatama",
  storageBucket: "ctcpgalatama.firebasestorage.app",
  messagingSenderId: "707078944851",
  appId: "1:707078944851:web:989e564a14cb9c0b122ea6",
  measurementId: "G-6PSWYCKFY9"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const storage = getStorage(app);
export { app }; // ✅ tambahkan baris ini
