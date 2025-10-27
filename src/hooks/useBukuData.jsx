import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { message } from 'antd';
import { db } from '../api/firebase'; // Pastikan path ini benar

let plateCache = [];
let listeners = [];
let isInitialized = false;
let isLoading = false;
let globalUnsubscribe = null;

function notifyListeners() {
    listeners.forEach((listener) => {
        listener(plateCache);
    });
}

function initializeBukuListener() {
    if (globalUnsubscribe || isLoading) {
        return;
    }
    isLoading = true;
    const plateRef = ref(db, 'plate');

    globalUnsubscribe = onValue(
        plateRef,
        (snapshot) => {
            const data = snapshot.val();
            const loadedBuku = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            loadedBuku.sort((a, b) => (a.judul || '').localeCompare(b.judul || ''));
            
            plateCache = loadedBuku;
            isInitialized = true;
            isLoading = false;
            notifyListeners();
        },
        (error) => {
            console.error("Firebase error (plate global):", error);
            message.error("Gagal memuat data plate.");
            plateCache = [];
            isInitialized = true;
            isLoading = false;
            notifyListeners();
        }
    );
}

function useBukuData() {
    const [data, setData] = useState(plateCache);
    const [loading, setLoading] = useState(!isInitialized);

    useEffect(() => {
        if (!globalUnsubscribe) {
            initializeBukuListener();
        }

        listeners.push(setData);

        if (isInitialized) {
            setData(plateCache);
            setLoading(false);
        }

        return () => {
            listeners = listeners.filter((cb) => cb !== setData);
        };
    }, []);

    return { data: plateCache, loading: loading && !isInitialized };
}

export default useBukuData;