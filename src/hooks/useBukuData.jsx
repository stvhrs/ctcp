import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { message } from 'antd';
import { db } from '../api/firebase'; // Pastikan path ini benar

let bukuCache = [];
let listeners = [];
let isInitialized = false;
let isLoading = false;
let globalUnsubscribe = null;

function notifyListeners() {
    listeners.forEach((listener) => {
        listener(bukuCache);
    });
}

function initializeBukuListener() {
    if (globalUnsubscribe || isLoading) {
        return;
    }
    isLoading = true;
    const bukuRef = ref(db, 'plate');

    globalUnsubscribe = onValue(
        bukuRef,
        (snapshot) => {
            const data = snapshot.val();
            const loadedBuku = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            loadedBuku.sort((a, b) => (a.ukuran || '').localeCompare(b.ukuran || ''));
            
            bukuCache = loadedBuku;
            isInitialized = true;
            isLoading = false;
            notifyListeners();
        },
        (error) => {
            console.error("Firebase error (plate global):", error);
            message.error("Gagal memuat data plate.");
            bukuCache = [];
            isInitialized = true;
            isLoading = false;
            notifyListeners();
        }
    );
}

function useBukuData() {
    const [data, setData] = useState(bukuCache);
    const [loading, setLoading] = useState(!isInitialized);

    useEffect(() => {
        if (!globalUnsubscribe) {
            initializeBukuListener();
        }

        listeners.push(setData);

        if (isInitialized) {
            setData(bukuCache);
            setLoading(false);
        }

        return () => {
            listeners = listeners.filter((cb) => cb !== setData);
        };
    }, []);

    return { data: bukuCache, loading: loading && !isInitialized };
}

export default useBukuData;