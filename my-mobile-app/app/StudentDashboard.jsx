import React, { useState, useEffect } from 'react';
import { 
    View, Text, StyleSheet, ScrollView, TouchableOpacity, 
    TextInput, Modal, Alert, ActivityIndicator, 
    Platform, StatusBar, SafeAreaView, Image, Linking 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location'; 
import { auth, db } from './firebase'; 
import { doc, getDoc, collection, query, where, getDocs, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp, onSnapshot, orderBy } from 'firebase/firestore';
import { onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import QRCode from 'react-native-qrcode-svg';

const STORAGE_KEYS = {
    USER: 'yallaclass_user',
    COURSES: 'yallaclass_courses_student',
    UPCOMING: 'yallaclass_upcoming_student',
    ATTENDANCE: 'yallaclass_attendance_student',
    TREND: 'yallaclass_trend_student',
    PROFILE_IMAGE: 'yallaclass_student_image'
};

const calculateRiskScore = (attendanceRate, grades, gpa, timeliness) => {
    const attendanceWeight = 0.2;
    const gradesWeight = 0.4;
    const gpaWeight = 0.2;
    const timelinessWeight = 0.2;
    const attendanceScore = attendanceRate || 0;
    const gradesScore = grades || 0;
    const gpaScore = (parseFloat(gpa) || 0) * 25;
    const timelinessScore = timeliness || 0; 
    const riskScore = (attendanceScore * attendanceWeight) + 
                      (gradesScore * gradesWeight) + 
                      (gpaScore * gpaWeight) + 
                      (timelinessScore * timelinessWeight);
    
    return Math.round(riskScore);
};

const getRiskLevel = (score) => {
    if (score < 40) return { level: 'High Risk', color: '#ef4444', icon: '🔴' };
    if (score < 60) return { level: 'Medium Risk', color: '#f59e0b', icon: '🟡' };
    if (score < 80) return { level: 'Low Risk', color: '#10b981', icon: '🟢' };
    return { level: 'Very Low Risk', color: '#3b82f6', icon: '🔵' };
};

const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; 
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const deltaP = (lat2-lat1) * Math.PI/180;
    const deltaLon = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(deltaP/2) * Math.sin(deltaP/2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(deltaLon/2) * Math.sin(deltaLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
};

export default function StudentDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('Dashboard');
    const [searchQuery, setSearchQuery] = useState('');
    const [studentData, setStudentData] = useState({ 
        name: "Loading...", 
        id: "...", 
        email: "",
        department: "",
        academicYear: "",
        overallAttendance: 92, 
        enrolledCourses: 0, 
        activeSession: 1, 
        gpsActive: true,
        profileImage: null,
        gpa: 0
    });
    const [courses, setCourses] = useState([]);
    const [availableCourses, setAvailableCourses] = useState([]);
    const [attendance, setAttendance] = useState([]);
    const [upcoming, setUpcoming] = useState([]);
    const [trend, setTrend] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [profileImage, setProfileImage] = useState(null);
    
    // Modals States
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [isViewCourseModalOpen, setIsViewCourseModalOpen] = useState(false);
    const [isRiskDetailsModalOpen, setIsRiskDetailsModalOpen] = useState(false);
    const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
    const [isDigitalIdModalOpen, setIsDigitalIdModalOpen] = useState(false);
    const [selectedRiskCourse, setSelectedRiskCourse] = useState(null);

    // Messages States
    const [studentMessages, setStudentMessages] = useState([]);
    const [unreadMessageCount, setUnreadMessageCount] = useState(0);
    const [isMessagesModalOpen, setIsMessagesModalOpen] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState(null);
    const [isMessageToAdminModalOpen, setIsMessageToAdminModalOpen] = useState(false);
    const [isMessageToProfessorModalOpen, setIsMessageToProfessorModalOpen] = useState(false);
    const [messageToAdminText, setMessageToAdminText] = useState('');
    const [messageToAdminSubject, setMessageToAdminSubject] = useState('');
    const [messageToProfessorText, setMessageToProfessorText] = useState('');
    const [messageToProfessorSubject, setMessageToProfessorSubject] = useState('');
    const [selectedProfessor, setSelectedProfessor] = useState(null);
    const [professorsList, setProfessorsList] = useState([]);
    const [showProfPicker, setShowProfPicker] = useState(false);

    // LMS States
    const [lmsMaterials, setLmsMaterials] = useState([]);
    const [lmsAssignments, setLmsAssignments] = useState([]);
    const [selectedCourseForLMS, setSelectedCourseForLMS] = useState(null);
    const [activeLmsTab, setActiveLmsTab] = useState('materials');

    const [isLoading, setIsLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [checkingInCourseId, setCheckingInCourseId] = useState(null); 
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    const showNotification = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
};
    
    const [passwordFields, setPasswordFields] = useState({
        currentPassword: '', newPassword: '', confirmPassword: ''
    });
    
    const ALLOWED_RADIUS = 30;

    useEffect(() => {
        const loadSavedData = async () => {
            try {
                const savedImage = await AsyncStorage.getItem(STORAGE_KEYS.PROFILE_IMAGE);
                if (savedImage) {
                    setProfileImage(savedImage);
                    setStudentData(prev => ({ ...prev, profileImage: savedImage }));
                }
                const savedCourses = await AsyncStorage.getItem(STORAGE_KEYS.COURSES);
                const savedUpcoming = await AsyncStorage.getItem(STORAGE_KEYS.UPCOMING);
                const savedAttendance = await AsyncStorage.getItem(STORAGE_KEYS.ATTENDANCE);
                const savedTrend = await AsyncStorage.getItem(STORAGE_KEYS.TREND);

                if (savedCourses) setCourses(JSON.parse(savedCourses));
                if (savedUpcoming) setUpcoming(JSON.parse(savedUpcoming));
                if (savedAttendance) setAttendance(JSON.parse(savedAttendance));
                if (savedTrend) setTrend(JSON.parse(savedTrend));
            } catch (error) {
                console.error("Error loading data", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadSavedData();
    }, []);

    // جلب الرسايل
    useEffect(() => {
        if (!auth.currentUser) return;
        const messagesRef = collection(db, "messages");
        const q = query(messagesRef, where("toId", "==", auth.currentUser.uid), orderBy("createdAt", "desc"));
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const messagesArray = [];
            let unread = 0;
            querySnapshot.forEach((doc) => {
                const messageData = { id: doc.id, ...doc.data() };
                messagesArray.push(messageData);
                if (!messageData.read) unread++;
            });
            setStudentMessages(messagesArray);
            setUnreadMessageCount(unread);
        });
        return () => unsubscribe();
    }, [auth.currentUser]);

    // جلب الأساتذة من الكورسات
    useEffect(() => {
        if (courses.length > 0) {
            const profsArray = [];
            courses.forEach(course => {
                if (course.instructor && course.instructor !== 'TBA' && course.instructor !== 'Loading...') {
                    if (!profsArray.find(p => p.id === course.id)) {
                        profsArray.push({
                            id: course.id,
                            name: course.instructor,
                            courseName: course.name,
                            courseId: course.id
                        });
                    }
                }
            });
            setProfessorsList(profsArray);
        }
    }, [courses]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const token = await AsyncStorage.getItem('token');
                    if(!token) {
                        router.replace('/');
                        return;
                    }
                    const userDocRef = doc(db, "users", user.uid);
                    const userDocSnap = await getDoc(userDocRef);
                  
                    if (userDocSnap.exists()) {
                        const userData = userDocSnap.data();
                        setStudentData(prev => ({
                            ...prev,
                            name: userData.fullName || "Student",
                            id: userData.code || "No ID",
                            email: userData.email || user.email,
                            department: userData.department || "General",
                            academicYear: userData.academicYear || "Year 1",
                            gpa: userData.gpa || 0
                        }));
                        
                        await loadStudentCourses(user.uid);
                        await loadAvailableCourses();

                        const currentRisk = userData.riskLevel || "Low Risk";
                        if (currentRisk === "High Risk" || currentRisk === "Medium Risk") {
                            updateRiskOnServer(user.uid, currentRisk);
                        }
                    }
                } catch (error) {
                    console.error("Error fetching student data:", error);
                }
            } else {
                router.replace('/');
            }
        });
        return () => unsubscribe();
    }, [router]);

    useEffect(() => {
        if (!isLoading) saveDataToStorage();
    }, [courses, upcoming, attendance, trend, isLoading]);

    useEffect(() => {
        const timer = setInterval(() => {
            setCourses(prev => prev.map(c => {
                if (c.timeRemaining > 0) return { ...c, timeRemaining: c.timeRemaining - 1 };
                else if (c.timeRemaining === 0 && c.checkedIn) return { ...c, checkedIn: false };
                return c;
            }));
        }, 60000);
        return () => clearInterval(timer);
    }, []);

    const saveDataToStorage = async () => {
        try {
            await AsyncStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(courses));
            await AsyncStorage.setItem(STORAGE_KEYS.UPCOMING, JSON.stringify(upcoming));
            await AsyncStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(attendance));
            await AsyncStorage.setItem(STORAGE_KEYS.TREND, JSON.stringify(trend));
        } catch (error) {}
    };

    const loadStudentCourses = async (userId) => {
        try {
            setLoading(true);
            const userDocRef = doc(db, "users", userId);
            const userDocSnap = await getDoc(userDocRef);
            if (!userDocSnap.exists()) return;
            
            const userData = userDocSnap.data();
            const enrolledCourseIds = userData.enrolledCourses || [];
            
            if (enrolledCourseIds.length === 0) {
                setCourses([]);
                setStudentData(prev => ({ ...prev, enrolledCourses: 0 }));
                return;
            }
            
            const coursesRef = collection(db, "courses");
            const enrolledCourses = [];
            
            for (const courseId of enrolledCourseIds) {
                const courseQuery = query(coursesRef, where("courseId", "==", courseId));
                const courseSnap = await getDocs(courseQuery);
                courseSnap.forEach((doc) => {
                    const courseData = doc.data();
                    enrolledCourses.push({
                        id: courseData.courseId,
                        name: courseData.courseName,
                        instructor: courseData.instructorName,
                        schedule: `${courseData.SelectDays || 'TBA'} ${courseData.Time || ''}`,
                        days: courseData.SelectDays ? courseData.SelectDays.split(', ') : [],
                        time: courseData.Time || 'TBA',
                        room: courseData.RoomNumber || 'TBA',
                        students: parseInt(courseData.capacity) || 0,
                        attendanceRate: 0, checkedIn: false, timeRemaining: 0,
                        grades: 0, timeliness: 0, riskScore: 0, riskLevel: getRiskLevel(0)
                    });
                });
            }
            setCourses(enrolledCourses);
            setStudentData(prev => ({ ...prev, enrolledCourses: enrolledCourses.length }));
            
            const upcomingClasses = enrolledCourses.map((c, index) => ({
                id: index + 1, name: c.name, time: c.time, room: c.room,
                date: index === 0 ? "Today" : index === 1 ? "Today" : "Tomorrow",
                courseId: c.id
            }));
            setUpcoming(upcomingClasses);
            
            const attendanceRecords = enrolledCourses.map(c => ({
                class: c.id, name: c.name, onTime: 0, late: 0, absences: 0, total: 0
            }));
            setAttendance(attendanceRecords);
            
        } catch (error) {
            showNotification('Error loading courses', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadAvailableCourses = async () => {
        try {
            const coursesRef = collection(db, "courses");
            const coursesSnap = await getDocs(coursesRef);
            const coursesList = [];
            coursesSnap.forEach((doc) => {
                const courseData = doc.data();
                coursesList.push({
                    id: courseData.courseId, name: courseData.courseName, instructor: courseData.instructorName,
                    schedule: `${courseData.SelectDays || 'TBA'} ${courseData.Time || ''}`,
                    room: courseData.RoomNumber || 'TBA', capacity: parseInt(courseData.capacity) || 0,
                    enrolled: courseData.enrolledStudents || 0
                });
            });
            setAvailableCourses(coursesList);
        } catch (error) {}
    };

    const handleAddCourse = async (course) => {
        try {
            const user = auth.currentUser;
            if (!user) return;
            if (courses.length >= 5) { showNotification('Limit reached (5 courses max)', 'error'); return; }
            if (courses.some(c => c.id === course.id)) { showNotification('Already enrolled', 'error'); return; }

            setLoading(true);
            await updateDoc(doc(db, "users", user.uid), { enrolledCourses: arrayUnion(course.id) });
            
            const newCourse = {
                ...course, students: course.capacity, attendanceRate: 0, checkedIn: false, timeRemaining: 0,
                grades: 0, timeliness: 0, riskScore: 0, riskLevel: getRiskLevel(0)
            };

            setCourses(prev => [...prev, newCourse]);
            setStudentData(prev => ({ ...prev, enrolledCourses: prev.enrolledCourses + 1 }));
            showNotification(`Successfully enrolled in ${course.name}`, 'success');
            setIsAddCourseModalOpen(false);
        } catch (error) {
            showNotification('Error enrolling in course', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCourse = async (courseId) => {
        Alert.alert('Drop Course', 'Are you sure you want to drop this course?', [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Drop', style: 'destructive',
                onPress: async () => {
                    try {
                        const user = auth.currentUser;
                        if (!user) return;
                        setLoading(true);
                        await updateDoc(doc(db, "users", user.uid), { enrolledCourses: arrayRemove(courseId) });
                        setCourses(prev => prev.filter(c => c.id !== courseId));
                        setUpcoming(prev => prev.filter(u => u.courseId !== courseId));
                        setStudentData(prev => ({ ...prev, enrolledCourses: prev.enrolledCourses - 1 }));
                        showNotification('Course dropped successfully', 'success');
                    } catch (error) {
                        showNotification('Error dropping course', 'error');
                    } finally {
                        setLoading(false);
                    }
                }
            }
        ]);
    };

    const handleImageUpload = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionResult.granted === false) return;

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true, aspect: [1, 1], quality: 0.5,
        });

        if (!result.canceled) {
            const uri = result.assets[0].uri;
            setProfileImage(uri);
            setStudentData(prev => ({ ...prev, profileImage: uri }));
            await AsyncStorage.setItem(STORAGE_KEYS.PROFILE_IMAGE, uri);
            showNotification('Profile photo updated!');
        }
    };

    const removeProfileImage = async () => {
        setProfileImage(null);
        setStudentData(prev => ({ ...prev, profileImage: null }));
        await AsyncStorage.removeItem(STORAGE_KEYS.PROFILE_IMAGE);
        showNotification('Photo removed');
    };

    const fetchLMSMaterials = async (courseId) => {
        try {
            const q = query(collection(db, "lms_materials"), where("courseId", "==", courseId));
            const snapshot = await getDocs(q);
            setLmsMaterials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) { setLmsMaterials([]); }
    };

    const fetchLMSAssignments = async (courseId) => {
        try {
            const q = query(collection(db, "lms_assignments"), where("courseId", "==", courseId));
            const snapshot = await getDocs(q);
            const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const user = auth.currentUser;
            if (user) {
                for (let assignment of assignments) {
                    const submissionQuery = query(
                        collection(db, "lms_submissions"),
                        where("assignmentId", "==", assignment.id),
                        where("studentId", "==", user.uid)
                    );
                    const submissionSnap = await getDocs(submissionQuery);
                    if (!submissionSnap.empty) {
                        assignment.submitted = true;
                        assignment.submission = submissionSnap.docs[0].data();
                    } else {
                        assignment.submitted = false;
                    }
                }
            }
            setLmsAssignments(assignments);
        } catch (error) { setLmsAssignments([]); }
    };

    useEffect(() => {
        if (selectedCourseForLMS) {
            fetchLMSMaterials(selectedCourseForLMS.id);
            fetchLMSAssignments(selectedCourseForLMS.id);
        }
    }, [selectedCourseForLMS]);

    const handleCheckIn = async (courseId, courseName) => {
        const activeCheckedInCourse = courses.find(c => c.checkedIn && c.timeRemaining > 0 && c.id !== courseId);
        if (activeCheckedInCourse) {
            Alert.alert("Active Session", `You are already checked in to ${activeCheckedInCourse.name}.`);
            return;
        }

        try {
            setCheckingInCourseId(courseId);

            const sessionRef = doc(db, "active_sessions", courseId);
            const sessionSnap = await getDoc(sessionRef);

            if (!sessionSnap.exists() || !sessionSnap.data().isActive) {
                Alert.alert("Not Open", "The professor has not started the attendance session for this course yet.");
                setCheckingInCourseId(null);
                return;
            }

            const sessionData = sessionSnap.data();
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission Denied", "Location permission is required.");
                setCheckingInCourseId(null);
                return;
            }
            
            let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const distance = getDistanceFromLatLonInMeters(
                location.coords.latitude, location.coords.longitude, 
                sessionData.latitude, sessionData.longitude
            );

            if (distance <= ALLOWED_RADIUS) {
                if (auth.currentUser) {
                    await addDoc(collection(db, "attendance"), {
                        studentId: auth.currentUser.uid,
                        studentName: studentData.name,
                        courseId: courseId,
                        courseName: courseName,
                        status: "Present",
                        distanceFromClass: Math.round(distance),
                        timestamp: serverTimestamp()
                    });
                }
                
                setCourses(prev => prev.map(c => {
                    if (c.id === courseId && !c.checkedIn) {
                        const newAttendanceRate = Math.min(100, c.attendanceRate + 1);
                        const newRiskScore = calculateRiskScore(newAttendanceRate, c.grades, studentData.gpa, c.timeliness);
                        return { 
                            ...c, checkedIn: true, attendanceRate: newAttendanceRate,
                            riskScore: newRiskScore, riskLevel: getRiskLevel(newRiskScore), timeRemaining: 60
                        };
                    }
                    return c;
                }));
                
                setStudentData(prev => ({ ...prev, overallAttendance: Math.min(100, prev.overallAttendance + 0.5) }));
                setAttendance(prev => prev.map(a => a.class === courseId ? { ...a, onTime: a.onTime + 1, total: a.total + 1 } : a));
                showNotification(`Checked in! Distance: ${Math.round(distance)}m`);
                updateOverallRiskScore();
            } else {
                Alert.alert("Check-in Failed", `You are ${Math.round(distance)} meters away. You must be inside the classroom.`);
            }
        } catch (error) {
            Alert.alert("Error", "Failed to check in. Check your internet/GPS.");
        } finally {
            setCheckingInCourseId(null);
        }
    };

    const updateOverallRiskScore = () => {
        const totalScore = courses.reduce((sum, c) => sum + (c.riskScore || 0), 0);
        const averageScore = courses.length > 0 ? Math.round(totalScore / courses.length) : 0;
        const newRisk = getRiskLevel(averageScore);
        if (auth.currentUser) updateRiskOnServer(auth.currentUser.uid, newRisk.level);
    };

    const updateRiskOnServer = async (uid, riskLevel) => {
        try {
            const token = await AsyncStorage.getItem('token');
            await fetch('https://backend-2-qju2.onrender.com/api/attendance/update-risk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ uid: uid, riskLevel: riskLevel })
            });
        } catch (error) {}
    };

    // 🔴 وظائف إرسال الرسايل الجديدة
    const markMessageAsRead = async (messageId) => {
        try { await updateDoc(doc(db, "messages", messageId), { read: true }); } catch (error) {}
    };

    const openMessagesModal = () => {
        setIsMessagesModalOpen(true);
        studentMessages.forEach(msg => { if (!msg.read) markMessageAsRead(msg.id); });
        setUnreadMessageCount(0);
    };

    const handleSendMessageToAdmin = async () => {
        if (!messageToAdminText.trim()) {
            showNotification("Please enter a message", 'error');
            return;
        }

        try {
            const messageData = {
                from: 'student',
                fromId: auth.currentUser?.uid,
                fromName: studentData.name,
                to: 'admin',
                toId: 'admin',
                toName: 'System Admin',
                subject: messageToAdminSubject.trim() || 'No Subject',
                message: messageToAdminText.trim(),
                createdAt: serverTimestamp(),
                read: false,
                adminRead: false
            };

            await addDoc(collection(db, "messages"), messageData);
            showNotification("Message sent to Admin successfully!", 'success');
            setIsMessageToAdminModalOpen(false);
            setMessageToAdminText('');
            setMessageToAdminSubject('');
        } catch (error) {
            showNotification("Failed to send message", 'error');
        }
    };

    const handleSendMessageToProfessor = async () => {
        if (!selectedProfessor || !messageToProfessorText.trim()) {
            showNotification("Please select a professor and enter a message", 'error');
            return;
        }

        try {
            const messageData = {
                from: 'student',
                fromId: auth.currentUser?.uid,
                fromName: studentData.name,
                to: 'professor',
                toId: selectedProfessor.id, 
                toName: selectedProfessor.name,
                subject: messageToProfessorSubject.trim() || 'No Subject',
                message: messageToProfessorText.trim(),
                createdAt: serverTimestamp(),
                read: false,
                adminRead: true 
            };

            await addDoc(collection(db, "messages"), messageData);
            showNotification(`Message sent to Professor ${selectedProfessor.name}!`, 'success');
            setIsMessageToProfessorModalOpen(false);
            setSelectedProfessor(null);
            setMessageToProfessorText('');
            setMessageToProfessorSubject('');
        } catch (error) {
            showNotification("Failed to send message", 'error');
        }
    };

    const getMessageSenderName = (msg) => {
        if (msg.from === 'admin') return `Admin (${msg.fromName || 'System'})`;
        if (msg.from === 'professor') return `Prof. ${msg.fromName || 'Professor'}`;
        return msg.fromName || 'Unknown';
    };

    const handlePasswordUpdate = async () => {
        const user = auth.currentUser;
        
        if (passwordFields.newPassword !== passwordFields.confirmPassword) {
            showNotification('New passwords do not match!', 'error');
            return;
        }

        try {
            const credential = EmailAuthProvider.credential(user.email, passwordFields.currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, passwordFields.newPassword);
            
            showNotification('Password updated successfully!');
            setIsPasswordModalOpen(false);
            setPasswordFields({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            showNotification('Error: Current password incorrect', 'error');
        }
    };

    const handleLogout = () => {
        Alert.alert("Logout", "Are you sure you want to logout?", [
            { text: "Cancel", style: "cancel" },
            { 
                text: "Logout", style: "destructive", 
                onPress: async () => {
                    await AsyncStorage.removeItem('token');
                    await AsyncStorage.removeItem(STORAGE_KEYS.PROFILE_IMAGE);
                    router.replace('/');
                } 
            }
        ]);
    };

    const openDigitalID = () => setIsDigitalIdModalOpen(true);
    const closeDigitalID = () => setIsDigitalIdModalOpen(false);

    const overallRiskScore = courses.length > 0 ? Math.round(courses.reduce((sum, c) => sum + (c.riskScore || 0), 0) / courses.length) : 0;
    const overallRiskLevel = getRiskLevel(overallRiskScore);

    if (isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#4361ee" /></View>;

    return (
        <SafeAreaView style={styles.container}>
            {toast.show && (
                <View style={[styles.toast, toast.type === 'error' ? styles.toastError : styles.toastSuccess]}>
                    <Text style={styles.toastText}>{toast.message}</Text>
                </View>
            )}

            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.welcomeText}>Welcome back,</Text>
                    <Text style={styles.userName}>{studentData.name}</Text>
                    <Text style={styles.userIdText}>ID: {studentData.id}</Text>
                    <TouchableOpacity style={styles.digitalIdButton} onPress={openDigitalID}>
                        <Feather name="shield" size={14} color="#fff" />
                        <Text style={styles.digitalIdButtonText}>Digital ID</Text>
                    </TouchableOpacity>
                </View>
                <View style={{flexDirection:'row', alignItems:'center', gap: 15}}>
                    <TouchableOpacity style={styles.notificationBtn} onPress={openMessagesModal}>
                        <Feather name="bell" size={22} color="#64748b" />
                        {unreadMessageCount > 0 && (
                            <View style={styles.notificationBadge}><Text style={styles.badgeText}>{unreadMessageCount}</Text></View>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleImageUpload}>
                        {profileImage || studentData.profileImage ? (
                            <Image source={{ uri: profileImage || studentData.profileImage }} style={styles.userAvatarImage} />
                        ) : (
                            <View style={styles.userAvatar}>
                                <Text style={styles.avatarText}>{studentData.name.charAt(0).toUpperCase()}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Navigation 🔴 شيلنا التابات اللي ملهاش لازمة */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topNav} contentContainerStyle={styles.topNavContent}>
                {['Dashboard', 'My Courses', 'LMS', 'Messages'].map(tab => (
                    <TouchableOpacity key={tab} style={[styles.navItem, activeTab === tab && styles.navItemActive]} onPress={() => setActiveTab(tab)}>
                        <Text style={[styles.navText, activeTab === tab && styles.navTextActive]}>{tab}</Text>
                    </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.navItemLogout} onPress={handleLogout}>
                    <Feather name="log-out" size={14} color="#ef4444" /><Text style={styles.navTextLogout}>Logout</Text>
                </TouchableOpacity>
            </ScrollView>

            <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false}>
                
                {/* DASHBOARD TAB */}
                {activeTab === 'Dashboard' && (
                    <View>
                        <View style={styles.statsGrid}>
                            <View style={styles.statCard}><Text style={styles.statLabel}>Attendance</Text><Text style={styles.statValue}>{studentData.overallAttendance}%</Text></View>
                            <View style={styles.statCard}><Text style={styles.statLabel}>Courses</Text><Text style={styles.statValue}>{courses.length}/5</Text></View>
                            <View style={[styles.statCard, { borderLeftWidth: 4, borderLeftColor: overallRiskLevel.color }]}>
                                <Text style={styles.statLabel}>Risk Score</Text>
                                <Text style={[styles.statValue, { color: overallRiskLevel.color }]}>{overallRiskScore}</Text>
                                <Text style={[styles.statSmallLabel, { color: overallRiskLevel.color }]}>{overallRiskLevel.level}</Text>
                            </View>
                        </View>
                        
                        <View style={styles.sectionCard}>
                            <View style={styles.sectionHeader}>
                                <Feather name="calendar" size={20} color="#4361ee" />
                                <Text style={styles.sectionTitle}>Today's Schedule</Text>
                            </View>
                            {upcoming.filter(u => u.date === "Today").length === 0 ? (
                                <Text style={styles.noDataText}>No classes today</Text>
                            ) : (
                                upcoming.filter(u => u.date === "Today").map((cls, idx) => {
                                    const course = courses.find(c => c.id === cls.courseId);
                                    return (
                                        <View style={styles.scheduleItem} key={idx}>
                                            <View style={styles.scheduleTime}>
                                                <Feather name="clock" size={14} color="#64748b" />
                                                <Text style={styles.scheduleTimeText}>{cls.time}</Text>
                                            </View>
                                            <View style={styles.scheduleDetails}>
                                                <Text style={styles.scheduleName}>{cls.name}</Text>
                                                <Text style={styles.scheduleRoom}>Room {cls.room}</Text>
                                            </View>
                                            <TouchableOpacity 
                                                style={[styles.checkInMini, course?.checkedIn && styles.checkInMiniDisabled]}
                                                onPress={() => handleCheckIn(cls.courseId, cls.name)}
                                                disabled={course?.checkedIn || checkingInCourseId !== null}
                                            >
                                                {checkingInCourseId === cls.courseId ? (
                                                    <ActivityIndicator color="#fff" size="small" />
                                                ) : (
                                                    <Text style={styles.checkInMiniText}>
                                                        {course?.checkedIn ? '✓ Checked' : 'Check In'}
                                                    </Text>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })
                            )}
                        </View>
                    </View>
                )}

                {/* MY COURSES TAB */}
                {activeTab === 'My Courses' && (
                    <View style={styles.fullPageCard}>
                        <View style={styles.cardHeader}>
                            <View style={styles.headerTitle}>
                                <Feather name="book-open" size={24} color="#4361ee" />
                                <Text style={styles.headerTitleText}>My Courses ({courses.length}/5)</Text>
                            </View>
                            {courses.length < 5 && (
                                <TouchableOpacity style={styles.addButton} onPress={() => setIsAddCourseModalOpen(true)}>
                                    <Feather name="plus" size={18} color="#fff" /><Text style={styles.addButtonText}>Add</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        {courses.length === 0 ? (
                            <View style={styles.emptyState}><Text style={styles.emptyStateText}>No courses enrolled.</Text></View>
                        ) : (
                            courses.map(course => (
                                <View style={styles.courseCard} key={course.id}>
                                    <View style={styles.courseCardHeader}>
                                        <Text style={styles.courseCardCode}>{course.id}</Text>
                                        <TouchableOpacity onPress={() => handleDeleteCourse(course.id)}>
                                            <Feather name="trash-2" size={16} color="#ef4444" />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={styles.courseCardName}>{course.name}</Text>
                                    <Text style={styles.courseCardInstructor}>{course.instructor}</Text>
                                    <View style={styles.courseCardFooter}>
                                        <TouchableOpacity 
                                            style={[styles.checkInButton, course.checkedIn && styles.checkInButtonDisabled]}
                                            onPress={() => handleCheckIn(course.id, course.name)}
                                            disabled={course.checkedIn || checkingInCourseId !== null}
                                        >
                                            {checkingInCourseId === course.id ? (
                                                <ActivityIndicator color="#fff" size="small" />
                                            ) : (
                                                <Text style={styles.checkInButtonText}>{course.checkedIn ? 'Checked In' : 'Check In'}</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                    <TouchableOpacity style={[styles.riskBadge, { backgroundColor: course.riskLevel?.color + '20' }]}>
                                        <Text style={[styles.riskBadgeText, { color: course.riskLevel?.color }]}>
                                            Risk: {course.riskScore} - {course.riskLevel?.level}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            ))
                        )}
                    </View>
                )}

                {/* LMS TAB */}
                {activeTab === 'LMS' && (
                    <View>
                        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10}}>
                            <Feather name="book" size={24} color="#4361ee" />
                            <Text style={styles.sectionTitle}>Learning Management</Text>
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 20}}>
                            {courses.map(course => (
                                <TouchableOpacity 
                                    key={course.id} 
                                    style={[styles.coursePill, selectedCourseForLMS?.id === course.id && styles.coursePillActive]}
                                    onPress={() => setSelectedCourseForLMS(course)}
                                >
                                    <Text style={[styles.coursePillText, selectedCourseForLMS?.id === course.id && {color: '#fff'}]}>
                                        {course.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {selectedCourseForLMS ? (
                            <View>
                                <View style={styles.lmsTabs}>
                                    <TouchableOpacity style={[styles.lmsTab, activeLmsTab === 'materials' && styles.lmsTabActive]} onPress={() => setActiveLmsTab('materials')}>
                                        <Text style={[styles.lmsTabText, activeLmsTab === 'materials' && {color: '#4361ee'}]}>Materials</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.lmsTab, activeLmsTab === 'assignments' && styles.lmsTabActive]} onPress={() => setActiveLmsTab('assignments')}>
                                        <Text style={[styles.lmsTabText, activeLmsTab === 'assignments' && {color: '#4361ee'}]}>Assignments</Text>
                                    </TouchableOpacity>
                                </View>

                                {activeLmsTab === 'materials' && (
                                    <View>
                                        {lmsMaterials.length === 0 ? <Text style={styles.noDataText}>No materials uploaded yet.</Text> : 
                                            lmsMaterials.map(mat => (
                                                <View key={mat.id} style={styles.lmsCard}>
                                                    <Feather name="file-text" size={24} color="#4361ee" />
                                                    <View style={{flex: 1, marginLeft: 10}}>
                                                        <Text style={{fontWeight: 'bold', fontSize: 16}}>{mat.title}</Text>
                                                        <Text style={{color: '#64748b', fontSize: 12}}>{mat.description}</Text>
                                                    </View>
                                                    {mat.fileUrl && (
                                                        <TouchableOpacity onPress={() => Linking.openURL(mat.fileUrl)} style={styles.downloadBtn}>
                                                            <Feather name="download" size={16} color="#fff" />
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            ))
                                        }
                                    </View>
                                )}

                                {activeLmsTab === 'assignments' && (
                                    <View>
                                        {lmsAssignments.length === 0 ? <Text style={styles.noDataText}>No assignments created yet.</Text> : 
                                            lmsAssignments.map(ass => (
                                                <View key={ass.id} style={styles.lmsCard}>
                                                    <View style={{flexDirection: 'row', alignItems: 'center', width: '100%'}}>
                                                        <Feather name="edit-3" size={24} color="#eab308" />
                                                        <View style={{flex: 1, marginLeft: 10}}>
                                                            <Text style={{fontWeight: 'bold', fontSize: 16}}>{ass.title}</Text>
                                                            <Text style={{color: '#64748b', fontSize: 12}}>Due: {new Date(ass.dueDate).toLocaleDateString()}</Text>
                                                        </View>
                                                        {ass.fileUrl && (
                                                            <TouchableOpacity onPress={() => Linking.openURL(ass.fileUrl)} style={styles.downloadBtn}>
                                                                <Feather name="download" size={16} color="#fff" />
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                    
                                                    {/* زرار التسليم أو حالة التسليم */}
                                                    <View style={{marginTop: 15, width: '100%', borderTopWidth: 1, borderColor: '#edf2f7', paddingTop: 10}}>
                                                        {ass.submitted ? (
                                                            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5}}>
                                                                <Feather name="check-circle" size={16} color="#10b981" />
                                                                <Text style={{color: '#10b981', fontWeight: 'bold'}}>Submitted</Text>
                                                            </View>
                                                        ) : (
                                                            <TouchableOpacity 
                                                                style={{backgroundColor: '#e6f0fa', padding: 10, borderRadius: 8, alignItems: 'center'}}
                                                                onPress={() => Alert.alert("Upload Assignment", "Please use the Web Dashboard to upload and submit assignment files.")}
                                                            >
                                                                <Text style={{color: '#4a90e2', fontWeight: 'bold'}}>Submit from Web Dashboard</Text>
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                </View>
                                            ))
                                        }
                                    </View>
                                )}
                            </View>
                        ) : (
                            <Text style={styles.noDataText}>Select a course to view LMS content.</Text>
                        )}
                    </View>
                )}

                {/* 🔴 MESSAGES TAB 🔴 */}
                {activeTab === 'Messages' && (
                    <View>
                        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10}}>
                            <Feather name="message-square" size={24} color="#4361ee" />
                            <Text style={styles.sectionTitle}>Message Center</Text>
                        </View>

                        <View style={{flexDirection: 'row', gap: 10, marginBottom: 20}}>
                            <TouchableOpacity 
                                style={[styles.messageActionCard, {backgroundColor: '#e6f0fa'}]}
                                onPress={() => setIsMessageToProfessorModalOpen(true)}
                            >
                                <Feather name="user-check" size={24} color="#4a90e2" />
                                <Text style={{color: '#4a90e2', fontWeight: 'bold', marginTop: 5}}>Message Professor</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={[styles.messageActionCard, {backgroundColor: '#ede9fe'}]}
                                onPress={() => setIsMessageToAdminModalOpen(true)}
                            >
                                <Feather name="shield" size={24} color="#8b5cf6" />
                                <Text style={{color: '#8b5cf6', fontWeight: 'bold', marginTop: 5}}>Message Admin</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.fullPageCard}>
                            <Text style={{fontWeight: 'bold', fontSize: 16, marginBottom: 15, color: '#1e293b'}}>
                                Inbox ({unreadMessageCount} unread)
                            </Text>
                            {studentMessages.length === 0 ? (
                                <Text style={styles.noDataText}>No messages yet</Text>
                            ) : (
                                studentMessages.map(msg => (
                                    <TouchableOpacity 
                                        key={msg.id} 
                                        style={[styles.messageItem, !msg.read && styles.messageItemUnread]}
                                        onPress={() => {
                                            setSelectedMessage(msg);
                                            if (!msg.read) markMessageAsRead(msg.id);
                                        }}
                                    >
                                        <View style={{flex: 1}}>
                                            <Text style={{fontWeight: 'bold', color: '#1e293b'}}>{getMessageSenderName(msg)}</Text>
                                            <Text style={{fontSize: 12, color: '#4a90e2', marginVertical: 3}}>{msg.subject}</Text>
                                            <Text numberOfLines={1} style={{color: '#64748b', fontSize: 13}}>{msg.message}</Text>
                                        </View>
                                        {!msg.read && <View style={styles.unreadDot} />}
                                    </TouchableOpacity>
                                ))
                            )}
                        </View>
                    </View>
                )}

                <View style={{ height: 50 }} />
            </ScrollView>

            {/* SEND MESSAGE MODALS */}
            <Modal visible={isMessageToAdminModalOpen} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Message Admin</Text>
                            <TouchableOpacity onPress={() => setIsMessageToAdminModalOpen(false)}>
                                <Feather name="x" size={20} color="#64748b" />
                            </TouchableOpacity>
                        </View>
                        <TextInput 
                            style={styles.modalInput} 
                            placeholder="Subject (Optional)" 
                            value={messageToAdminSubject} 
                            onChangeText={setMessageToAdminSubject} 
                        />
                        <TextInput 
                            style={[styles.modalInput, {height: 100, textAlignVertical: 'top'}]} 
                            placeholder="Type your message here..." 
                            multiline 
                            value={messageToAdminText} 
                            onChangeText={setMessageToAdminText} 
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsMessageToAdminModalOpen(false)}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.submitBtn} onPress={handleSendMessageToAdmin}>
                                <Text style={styles.submitText}>Send</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={isMessageToProfessorModalOpen} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, {maxHeight: '90%'}]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Message Professor</Text>
                            <TouchableOpacity onPress={() => setIsMessageToProfessorModalOpen(false)}>
                                <Feather name="x" size={20} color="#64748b" />
                            </TouchableOpacity>
                        </View>
                        
                        <TouchableOpacity style={styles.pickerButton} onPress={() => setShowProfPicker(true)}>
                            <Text>{selectedProfessor ? `Prof. ${selectedProfessor.name} (${selectedProfessor.courseName})` : 'Select Professor...'}</Text>
                        </TouchableOpacity>

                        <TextInput 
                            style={styles.modalInput} 
                            placeholder="Subject (Optional)" 
                            value={messageToProfessorSubject} 
                            onChangeText={setMessageToProfessorSubject} 
                        />
                        <TextInput 
                            style={[styles.modalInput, {height: 100, textAlignVertical: 'top'}]} 
                            placeholder="Type your message here..." 
                            multiline 
                            value={messageToProfessorText} 
                            onChangeText={setMessageToProfessorText} 
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsMessageToProfessorModalOpen(false)}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.submitBtn} onPress={handleSendMessageToProfessor}>
                                <Text style={styles.submitText}>Send</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* PROFESSOR PICKER MODAL */}
            <Modal visible={showProfPicker} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                        <Text style={styles.modalTitle}>Select Professor</Text>
                        <ScrollView>
                            {professorsList.map((prof, index) => (
                                <TouchableOpacity 
                                    key={index} 
                                    style={styles.coursePickerItem} 
                                    onPress={() => {
                                        setSelectedProfessor(prof);
                                        setShowProfPicker(false);
                                    }}
                                >
                                    <Text style={{fontWeight: 'bold'}}>Prof. {prof.name}</Text>
                                    <Text style={{color: '#64748b', fontSize: 12}}>{prof.courseName}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={[styles.cancelBtn, {marginTop: 10}]} onPress={() => setShowProfPicker(false)}>
                            <Text style={{textAlign: 'center'}}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* MESSAGE DETAIL MODAL */}
            <Modal visible={selectedMessage !== null} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Message Details</Text>
                        <View style={styles.messageDetailBox}>
                            <Text style={{fontWeight: 'bold'}}>Subject: {selectedMessage?.subject}</Text>
                            <Text style={{color: '#64748b', fontSize: 12, marginVertical: 10}}>From: {getMessageSenderName(selectedMessage || {})}</Text>
                            <Text style={{fontSize: 15, lineHeight: 22, color: '#1e293b'}}>{selectedMessage?.message}</Text>
                        </View>
                        <TouchableOpacity style={styles.submitBtn} onPress={() => setSelectedMessage(null)}>
                            <Text style={styles.submitText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ADD COURSE MODAL */}
            <Modal visible={isAddCourseModalOpen} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add New Course</Text>
                            <TouchableOpacity onPress={() => setIsAddCourseModalOpen(false)}>
                                <Feather name="x" size={20} color="#64748b" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView>
                            {availableCourses.filter(c => !courses.some(enrolled => enrolled.id === c.id)).map(course => (
                                <View style={styles.availableCourseCard} key={course.id}>
                                    <View style={{flex: 1}}>
                                        <Text style={{color: '#4361ee', fontWeight: 'bold'}}>{course.id}</Text>
                                        <Text style={{fontSize: 16, fontWeight: 'bold'}}>{course.name}</Text>
                                        <Text style={{color: '#64748b', fontSize: 12}}>{course.instructor}</Text>
                                    </View>
                                    <TouchableOpacity style={styles.addCourseConfirm} onPress={() => handleAddCourse(course)}>
                                        <Text style={{color: '#fff', fontWeight: 'bold'}}>Add</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* DIGITAL ID MODAL */}
            <Modal visible={isDigitalIdModalOpen} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Digital ID</Text>
                        <View style={{alignItems: 'center', marginVertical: 20}}>
                            <QRCode 
                                value={JSON.stringify({
                                    name: studentData.name, id: studentData.id, role: "Student"
                                })} 
                                size={150} color="#4361ee" 
                            />
                            <Text style={{marginTop: 15, fontWeight: 'bold', fontSize: 18}}>{studentData.name}</Text>
                            <Text style={{color: '#64748b'}}>{studentData.id}</Text>
                        </View>
                        <TouchableOpacity style={styles.cancelBtn} onPress={closeDigitalID}>
                            <Text style={{textAlign: 'center', fontWeight: 'bold', color: '#64748b'}}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 40) + 10 : 45 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
    toast: { position: 'absolute', top: 50, left: 20, right: 20, padding: 15, borderRadius: 10, zIndex: 1000, elevation: 5 },
    toastSuccess: { backgroundColor: '#10b981' }, toastError: { backgroundColor: '#ef4444' }, toastWarning: { backgroundColor: '#f59e0b' },
    toastText: { color: 'white', fontWeight: 'bold', textAlign: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15 },
    welcomeText: { fontSize: 14, color: '#64748b' }, userName: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
    userIdText: { fontSize: 14, color: '#4361ee', fontWeight: '600' }, userEmailText: { fontSize: 12, color: '#64748b' },
    removeText: { color: '#ef4444', fontSize: 12, marginTop: 5, fontWeight: 'bold' },
    userAvatar: { backgroundColor: '#4361ee', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
    userAvatarImage: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: '#4361ee' },
    avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
    notificationBtn: { position: 'relative' },
    notificationBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#ef4444', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    badgeText: { color: 'white', fontSize: 9, fontWeight: 'bold' },
    digitalIdButton: { backgroundColor: '#4a90e2', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 15, marginTop: 5, alignSelf: 'flex-start', gap: 4 },
    digitalIdButtonText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
    topNav: { backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#e2e8f0', minHeight: 65, maxHeight: 65 },
    topNavContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingRight: 30 },
    navItem: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', marginRight: 10 },
    navItemActive: { backgroundColor: '#4361ee' },
    navText: { color: '#64748b', fontWeight: '600', fontSize: 13 }, navTextActive: { color: '#fff' },
    navItemLogout: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fee2e2', marginRight: 10 },
    navTextLogout: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
    mainContent: { padding: 15 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 15 },
    statCard: { width: '31%', backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
    statLabel: { color: '#64748b', fontSize: 11, marginBottom: 5 }, statValue: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
    statSmallLabel: { fontSize: 10, marginTop: 2 },
    sectionCard: { backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 8 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', flex: 1 },
    scheduleItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    scheduleTime: { width: 70 }, scheduleTimeText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
    scheduleDetails: { flex: 1 }, scheduleName: { fontWeight: '600', color: '#1e293b', fontSize: 14 }, scheduleRoom: { color: '#64748b', fontSize: 11 },
    checkInMini: { backgroundColor: '#4361ee', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, width: 80, alignItems: 'center' },
    checkInMiniDisabled: { backgroundColor: '#10b981' }, checkInMiniText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
    fullPageCard: { backgroundColor: '#fff', padding: 20, borderRadius: 16 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 }, headerTitleText: { fontSize: 18, fontWeight: 'bold' },
    addButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4361ee', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 4 },
    addButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    emptyState: { alignItems: 'center', padding: 40 },
    emptyStateText: { color: '#64748b', marginTop: 10, marginBottom: 20, textAlign: 'center' },
    emptyStateButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4361ee', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, gap: 8 },
    emptyStateButtonText: { color: '#fff', fontWeight: 'bold' },
    courseCard: { backgroundColor: '#f8fafc', padding: 15, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' },
    courseCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    courseCardCode: { color: '#4361ee', fontWeight: 'bold' }, courseCardName: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    courseCardInstructor: { color: '#64748b', fontSize: 13, marginBottom: 10 },
    courseDetails: { marginBottom: 10 }, detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 }, detailText: { marginLeft: 6, color: '#475569', fontSize: 12 },
    courseCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    checkInButton: { backgroundColor: '#4361ee', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, flex: 1, alignItems: 'center', marginLeft: 10 },
    checkInButtonDisabled: { backgroundColor: '#10b981' }, checkInButtonText: { color: '#fff', fontWeight: 'bold' },
    riskBadge: { padding: 8, borderRadius: 8, marginTop: 10, alignItems: 'center' }, riskBadgeText: { fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
    cancelBtn: { paddingVertical: 12, borderRadius: 10, backgroundColor: '#f1f5f9', width: '100%', marginTop: 10 },
    submitBtn: { paddingVertical: 12, borderRadius: 10, backgroundColor: '#4361ee', width: '100%', marginTop: 10 },
    submitText: { color: '#fff', fontWeight: 'bold', textAlign: 'center' },
    availableCourseCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    addCourseConfirm: { backgroundColor: '#4361ee', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10 },
    coursePill: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#e2e8f0', borderRadius: 25, marginRight: 10 },
    coursePillActive: { backgroundColor: '#4361ee' }, coursePillText: { fontWeight: '600', color: '#475569' },
    lmsTabs: { flexDirection: 'row', marginBottom: 15, borderBottomWidth: 1, borderColor: '#e2e8f0' },
    lmsTab: { flex: 1, paddingVertical: 12, alignItems: 'center' }, lmsTabActive: { borderBottomWidth: 2, borderColor: '#4361ee' },
    lmsTabText: { fontWeight: 'bold', color: '#64748b' },
    lmsCard: { backgroundColor: '#f8fafd', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    downloadBtn: { backgroundColor: '#4361ee', padding: 10, borderRadius: 8 },
    noDataText: { textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: 20 },
    messageItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderRadius: 12 },
    messageItemUnread: { backgroundColor: '#eef2ff', borderColor: '#bfdbfe' },
    unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4361ee' },
    messageDetailBox: { backgroundColor: '#f8fafc', padding: 15, borderRadius: 12, marginTop: 10 },
    underDevelopment: { alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
    devTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginTop: 15, textAlign: 'center' },
    messageActionCard: { flex: 1, padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    modalInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, marginBottom: 15, color: '#1e293b' },
    pickerButton: { padding: 15, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#4361ee', borderRadius: 10, marginBottom: 15 },
    coursePickerItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
});