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
import { doc, getDoc, updateDoc, getDocs, collection, setDoc, addDoc, where, query, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import QRCode from 'react-native-qrcode-svg';

const STORAGE_KEYS = {
    PROF_IMAGE: 'yallaclass_prof_image'
};

export default function ProfessorDashboard() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    
    const [profileImage, setProfileImage] = useState(null);
    const [profData, setProfData] = useState({ name: 'Loading...', code: '...' });

    const [courses, setCourses] = useState([]);
    const [adminCourses, setAdminCourses] = useState([]);
    const [activeTab, setActiveTab] = useState('Dashboard');

    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState('');
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [newCourse, setNewCourse] = useState({ 
        id: '', name: '', schedule: '', room: '', students: '', capacity: '' 
    });

    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [passwordFields, setPasswordFields] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const [isDigitalIdModalOpen, setIsDigitalIdModalOpen] = useState(false);
    const [showCoursePicker, setShowCoursePicker] = useState(false);

    // --- Students Tab State ---
    const [enrolledStudents, setEnrolledStudents] = useState({});
    const [selectedCourseForStudents, setSelectedCourseForStudents] = useState(null);
    const [isLoadingStudents, setIsLoadingStudents] = useState(false);

    // --- LMS Tab State ---
    const [lmsMaterials, setLmsMaterials] = useState([]);
    const [lmsAssignments, setLmsAssignments] = useState([]);
    const [selectedCourseForLMS, setSelectedCourseForLMS] = useState(null);
    const [activeLmsTab, setActiveLmsTab] = useState('materials');

    // --- Live Attendance State ---
    const [attendanceCode, setAttendanceCode] = useState('');
    const [isStartingSession, setIsStartingSession] = useState(false);
    const [activeSessions, setActiveSessions] = useState({});

    useEffect(() => {
        const fetchAdminCourses = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, "courses"));
                const coursesList = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setAdminCourses(coursesList);
            } catch (error) {
                console.error("Error fetching admin courses:", error);
            }
        };
        fetchAdminCourses();
    }, []);

    useEffect(() => {
        const fetchProfessorCourses = async () => {
            const user = auth.currentUser;
            if (!user) return;

            try {
                const q = query(collection(db, "professorCourses"), where("professorId", "==", user.uid));
                const querySnapshot = await getDocs(q);
                
                if (!querySnapshot.empty) {
                    const professorCoursesList = querySnapshot.docs.map(doc => {
                        const data = doc.data();
                        return {
                            id: data.courseId,
                            name: data.courseName,
                            schedule: data.schedule,
                            room: data.room,
                            capacity: data.capacity || 0,
                            students: data.students || 0,
                            avgAttendance: data.avgAttendance || 0,
                            todayPresent: data.todayPresent || 0,
                            todayLate: data.todayLate || 0,
                            todayAbsent: data.todayAbsent || 0,
                            firestoreId: doc.id
                        };
                    });
                    
                    setCourses(prev => {
                        const existingIds = new Set(prev.map(c => c.id));
                        const newCourses = professorCoursesList.filter(c => !existingIds.has(c.id));
                        return [...prev, ...newCourses];
                    });
                }
            } catch (error) {
                console.error("Error fetching professor courses:", error);
            }
        };

        fetchProfessorCourses();
    }, []);

    useEffect(() => {
        const fetchActiveSessions = async () => {
            const user = auth.currentUser;
            if (!user) return;
            try {
                const q = query(collection(db, "active_sessions"), where("professorId", "==", user.uid));
                const snap = await getDocs(q);
                let sessions = {};
                snap.forEach(doc => {
                    sessions[doc.id] = true;
                });
                setActiveSessions(sessions);
            } catch (error) {
                console.error("Error fetching active sessions:", error);
            }
        };
        fetchActiveSessions();
    }, [auth.currentUser]);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const savedImage = await AsyncStorage.getItem(STORAGE_KEYS.PROF_IMAGE);
                if (savedImage) setProfileImage(savedImage);
            } catch (error) {
                console.error("Error loading image:", error);
            } 
        };
        loadInitialData();
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const token = await AsyncStorage.getItem('token');
                    if (!token) {
                        router.replace('/');
                        return;
                    }
                    const docRef = doc(db, "users", user.uid);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setProfData({
                            name: data.fullName || "Dr. Anonymous",
                            code: data.code || "No Code"
                        });
                    }
                } catch (error) {
                    console.error("Error fetching data:", error);
                } finally {
                    setIsLoading(false);
                }
            } else {
                setIsLoading(false);
                router.replace('/');
            }
        });
        return () => unsubscribe();
    }, [router]);

    // --- Students Functions ---
    const fetchEnrolledStudents = async (courseId) => {
        setIsLoadingStudents(true);
        try {
            const q = query(collection(db, "course_enrollments"), where("courseId", "==", courseId), where("status", "==", "active"));
            const snapshot = await getDocs(q);
            let students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            for (let student of students) {
                const attendanceQuery = query(collection(db, "attendance_records"), where("courseId", "==", courseId), where("studentId", "==", student.studentId));
                const attendanceSnapshot = await getDocs(attendanceQuery);
                const attendanceRecords = attendanceSnapshot.docs.map(doc => doc.data());
                
                const totalClasses = attendanceRecords.length || 1;
                const presentClasses = attendanceRecords.filter(r => r.status === 'present').length;
                const attendanceRate = (presentClasses / totalClasses) * 100;
                
                const gradesQuery = query(collection(db, "student_grades"), where("courseId", "==", courseId), where("studentId", "==", student.studentId));
                const gradesSnapshot = await getDocs(gradesQuery);
                const grades = gradesSnapshot.docs.map(doc => doc.data());
                const totalScore = grades.reduce((sum, g) => sum + (g.score || 0), 0);
                const averageGrade = grades.length > 0 ? (totalScore / grades.length) : 0;
                
                let riskScore = 0;
                if (attendanceRate < 50) riskScore += 40;
                else if (attendanceRate < 70) riskScore += 25;
                else if (attendanceRate < 85) riskScore += 10;

                if (averageGrade < 50) riskScore += 40;
                else if (averageGrade < 65) riskScore += 25;
                else if (averageGrade < 75) riskScore += 10;

                const lateCount = attendanceRecords.filter(r => r.status === 'late').length;
                if (lateCount > 10) riskScore += 20;
                else if (lateCount > 5) riskScore += 15;
                else if (lateCount > 2) riskScore += 10;
                else if (lateCount > 0) riskScore += 5;
                
                student.attendanceRate = Math.round(attendanceRate);
                student.averageGrade = Math.round(averageGrade);
                student.riskScore = riskScore;
                student.riskLevel = riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : 'low';
            }
            
            setEnrolledStudents(prev => ({ ...prev, [courseId]: students }));
        } catch (error) {
            showNotification('Error loading students', 'error');
        } finally {
            setIsLoadingStudents(false);
        }
    };

    const removeStudentFromCourse = async (enrollmentId, courseId, studentName) => {
        Alert.alert('Remove Student', `Remove ${studentName} from this course?`, [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Remove', 
                style: 'destructive', 
                onPress: async () => {
                    try {
                        await updateDoc(doc(db, "course_enrollments", enrollmentId), {
                            status: "dropped",
                            droppedAt: new Date().toISOString(),
                            droppedBy: auth.currentUser?.uid
                        });
                        setEnrolledStudents(prev => ({
                            ...prev,
                            [courseId]: prev[courseId].filter(s => s.id !== enrollmentId)
                        }));
                        showNotification(`${studentName} removed from course`, 'success');
                    } catch (error) {
                        showNotification('Error removing student', 'error');
                    }
                } 
            }
        ]);
    };

    // --- LMS Functions ---
    const fetchLMSMaterials = async (courseId) => {
        try {
            const q = query(collection(db, "lms_materials"), where("courseId", "==", courseId));
            const snapshot = await getDocs(q);
            setLmsMaterials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            setLmsMaterials([]);
        }
    };

    const fetchLMSAssignments = async (courseId) => {
        try {
            const q = query(collection(db, "lms_assignments"), where("courseId", "==", courseId));
            const snapshot = await getDocs(q);
            setLmsAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            setLmsAssignments([]);
        }
    };

    useEffect(() => {
        if (selectedCourseForLMS) {
            fetchLMSMaterials(selectedCourseForLMS.id);
            fetchLMSAssignments(selectedCourseForLMS.id);
        }
    }, [selectedCourseForLMS]);


    const showNotification = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };

    const handleLogout = () => {
        Alert.alert("Logout", "Are you sure you want to logout?", [
            { text: "Cancel", style: "cancel" },
            { 
                text: "Logout", 
                style: "destructive", 
                onPress: async () => {
                    await AsyncStorage.removeItem('token');
                    router.replace('/');
                } 
            }
        ]);
    };

    const handlePasswordInputChange = (name, value) => {
        setPasswordFields(prev => ({ ...prev, [name]: value }));
    };

    const handlePasswordUpdate = async () => {
        const user = auth.currentUser;
        if (passwordFields.newPassword !== passwordFields.confirmPassword) {
            showNotification("New passwords do not match!", 'error');
            return;
        }
        if (passwordFields.newPassword.length < 6) {
            showNotification("Password must be at least 6 characters!", 'error');
            return;
        }

        try {
            const credential = EmailAuthProvider.credential(user.email, passwordFields.currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, passwordFields.newPassword);
            showNotification("Password updated successfully!", 'success');
            setIsPasswordModalOpen(false);
            setPasswordFields({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            if (error.code === 'auth/wrong-password') showNotification("Current password is incorrect!", 'error');
            else showNotification("Error updating password. Please try again.", 'error');
        }
    };

    const handleImageUpload = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert("Permission Required", "Please allow access to photos");
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled) {
            const uri = result.assets[0].uri;
            setProfileImage(uri);
            await AsyncStorage.setItem(STORAGE_KEYS.PROF_IMAGE, uri);
            showNotification('Profile image updated successfully!');
        }
    };

    const removeProfileImage = async () => {
        setProfileImage(null);
        await AsyncStorage.removeItem(STORAGE_KEYS.PROF_IMAGE);
        showNotification('Profile image removed');
    };

    const openDigitalID = () => setIsDigitalIdModalOpen(true);
    const closeDigitalID = () => setIsDigitalIdModalOpen(false);

    const resetDailyAttendance = (courseId) => {
        setCourses(courses.map(c => c.id === courseId ? { ...c, todayPresent: 0, todayLate: 0, todayAbsent: 0 } : c));
        showNotification(`Attendance reset for ${courseId}`);
    };

    const resetAllAttendance = () => {
        Alert.alert('Reset Attendance', 'Reset today\'s attendance for ALL courses?', [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Reset', 
                style: 'destructive', 
                onPress: () => {
                    setCourses(courses.map(c => ({ ...c, todayPresent: 0, todayLate: 0, todayAbsent: 0 })));
                    showNotification('All courses reset for the day');
                } 
            }
        ]);
    };

    const filteredCourses = courses.filter(course =>
        course.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.id?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const openAddModal = () => {
        setModalType('add');
        setNewCourse({ id: '', name: '', schedule: '', room: '', students: '', capacity: '' });
        setShowModal(true);
    };

    // 🔴 دوال بدء الجلسة اللايف للمحاضرة
    const openAttendanceModal = (course) => {
        setModalType('attendance');
        setSelectedCourse(course);
        setAttendanceCode(Math.floor(1000 + Math.random() * 9000).toString()); // توليد كود من 4 أرقام
        setShowModal(true);
    };

    const startLiveAttendanceSession = async () => {
        if (!selectedCourse) return;
        setIsStartingSession(true);

        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                showNotification('Permission to access location was denied', 'error');
                setIsStartingSession(false);
                return;
            }

            let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const profLat = location.coords.latitude;
            const profLon = location.coords.longitude;

            const sessionData = {
                courseId: selectedCourse.id,
                courseName: selectedCourse.name,
                professorId: auth.currentUser.uid,
                professorName: profData.name,
                attendanceCode: attendanceCode,
                latitude: profLat,
                longitude: profLon,
                isActive: true,
                createdAt: new Date().toISOString()
            };

            await setDoc(doc(db, "active_sessions", selectedCourse.id), sessionData);
            setActiveSessions(prev => ({ ...prev, [selectedCourse.id]: true }));

            showNotification('Attendance session started successfully!');
            setShowModal(false);

        } catch (error) {
            console.error("Error starting session:", error);
            showNotification('Failed to start session. Check GPS/Network.', 'error');
        } finally {
            setIsStartingSession(false);
        }
    };

    // 🔴 دالة قفل الجلسة
    const endLiveAttendanceSession = async (courseId) => {
        Alert.alert("End Attendance", "Are you sure you want to close attendance for this course?", [
            { text: "Cancel", style: "cancel" },
            { 
                text: "Close Session", 
                style: "destructive", 
                onPress: async () => {
                    try {
                        await deleteDoc(doc(db, "active_sessions", courseId));
                        setActiveSessions(prev => ({ ...prev, [courseId]: false }));
                        showNotification('Attendance session closed successfully.', 'success');
                    } catch (error) {
                        console.error("Error closing session:", error);
                        showNotification('Failed to close session.', 'error');
                    }
                } 
            }
        ]);
    };

    const deleteCourse = async (id) => {
        Alert.alert('Delete Course', 'Are you sure you want to delete this course?', [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Delete', 
                style: 'destructive', 
                onPress: async () => {
                    try {
                        const user = auth.currentUser;
                        if (!user) return;
                        setCourses(courses.filter(c => c.id !== id));
                        const q = query(collection(db, "professorCourses"), where("professorId", "==", user.uid), where("courseId", "==", id));
                        const querySnapshot = await getDocs(q);
                        querySnapshot.forEach(async (document) => {
                            await deleteDoc(doc(db, "professorCourses", document.id));
                        });
                        showNotification(`Course ${id} deleted successfully`);
                    } catch (error) {
                        showNotification('Error deleting course', 'error');
                    }
                } 
            }
        ]);
    };

    const handleSelectCourseFromAdmin = (course) => {
        if (course) {
            setNewCourse({
                id: course.courseId || '',
                name: course.courseName || '',
                schedule: course.schedule || `${course.SelectDays || ''} | ${course.Time || ''}`,
                room: course.RoomNumber || '',
                students: course.totalStudents?.toString() || '0',
                capacity: course.capacity?.toString() || '0'
            });
            setShowCoursePicker(false);
            showNotification(`Course ${course.courseName} selected`, 'success');
        }
    };

    const saveCourse = async () => {
        if (!newCourse.id || !newCourse.name) {
            showNotification('Please select a valid course', 'error');
            return;
        }
        if (courses.some(c => c.id === newCourse.id)) {
            showNotification('This course is already in your list', 'error');
            return;
        }
        try {
            const user = auth.currentUser;
            if (!user) { showNotification('You must be logged in', 'error'); return; }

            const courseToAdd = {
                courseId: newCourse.id, courseName: newCourse.name, schedule: newCourse.schedule,
                room: newCourse.room, capacity: parseInt(newCourse.capacity) || 0,
                students: parseInt(newCourse.students) || 0, avgAttendance: 0, todayPresent: 0,
                todayLate: 0, todayAbsent: 0, professorId: user.uid, professorName: profData.name,
                professorCode: profData.code, assignedAt: new Date().toISOString()
            };
            setCourses(prev => [...prev, courseToAdd]);
            
            await addDoc(collection(db, "professorCourses"), { ...courseToAdd, userId: user.uid });    
            showNotification(`Course ${newCourse.id} added successfully`);
            setShowModal(false);
            setNewCourse({ id: '', name: '', schedule: '', room: '', students: '', capacity: '' });
        } catch (error) {
            showNotification('Error saving course. Please try again.', 'error');
        }
    };

    const exportData = () => {
        Alert.alert('Export Data', 'Data copied to clipboard. You can paste it anywhere.', [{ text: 'OK' }]);
        showNotification('Data exported to console');
    };

    const totalStudents = courses.reduce((sum, c) => sum + (c.students || 0), 0);
    const avgAttendance = Math.round(courses.reduce((sum, c) => sum + (c.avgAttendance || 0), 0) / (courses.length || 1));
    const totalPresent = courses.reduce((sum, c) => sum + (c.todayPresent || 0), 0);

    const getRiskColor = (riskScore) => riskScore >= 70 ? '#ef4444' : riskScore >= 40 ? '#eab308' : '#22c55e';

    // ======== RENDER METHODS ========

    const renderDashboard = () => (
        <View>
            <View style={styles.statsGrid}>
                <View style={styles.statCard}><Text style={styles.statLabel}>Total Courses</Text><Text style={styles.statValue}>{courses.length}</Text></View>
                <View style={styles.statCard}><Text style={styles.statLabel}>Total Students</Text><Text style={styles.statValue}>{totalStudents}</Text></View>
                <View style={styles.statCard}><Text style={styles.statLabel}>Avg Attendance</Text><Text style={styles.statValue}>{avgAttendance}%</Text></View>
                <View style={styles.statCard}><Text style={styles.statLabel}>Present Today</Text><Text style={styles.statValue}>{totalPresent}</Text></View>
            </View>
            <View style={styles.quickActionsGrid}>
                <TouchableOpacity style={[styles.actionCard, styles.cardBlue]} onPress={openAddModal}>
                    <Feather name="book-open" size={28} color="#fff" /><Text style={styles.actionText}>New Course</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionCard, styles.cardGreen]} onPress={() => setActiveTab('Students')}>
                    <Feather name="users" size={28} color="#fff" /><Text style={styles.actionText}>Students</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionCard, styles.cardYellow]} onPress={exportData}>
                    <Feather name="download" size={28} color="#fff" /><Text style={styles.actionText}>Export Data</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionCard, styles.cardRed]} onPress={resetAllAttendance}>
                    <Feather name="clock" size={28} color="#fff" /><Text style={styles.actionText}>Reset Today</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderMyCourses = () => (
        <View>
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>All Courses ({filteredCourses.length})</Text>
                <TouchableOpacity style={styles.addBtnPrimary} onPress={openAddModal}>
                    <Text style={styles.addBtnPrimaryText}>Add Course</Text>
                </TouchableOpacity>
            </View>
            {filteredCourses.length === 0 ? (
                <View style={styles.emptyState}><Text style={styles.emptyText}>No courses found.</Text></View>
            ) : (
                filteredCourses.map(course => (
                    <View key={course.id} style={styles.courseCard}>
                        <View style={styles.courseHeader}>
                            <Text style={styles.courseCode}>{course.id}</Text>
                            <TouchableOpacity onPress={() => deleteCourse(course.id)} style={styles.iconButton}>
                                <Feather name="trash-2" size={16} color="#ef4444" />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.courseName}>{course.name}</Text>
                        <Text style={styles.courseMeta}><Feather name="clock" size={12} /> {course.schedule} • {course.room}</Text>
                        
                        {/* 🔴 زرار الحضور اتعدل هنا */}
                        {activeSessions[course.id] ? (
                            <TouchableOpacity 
                                style={[styles.startAttendanceBtn, { backgroundColor: '#ef4444' }]} 
                                onPress={() => endLiveAttendanceSession(course.id)}
                            >
                                <Text style={styles.startAttendanceText}>End Attendance</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity 
                                style={styles.startAttendanceBtn} 
                                onPress={() => openAttendanceModal(course)}
                            >
                                <Text style={styles.startAttendanceText}>Start Attendance</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ))
            )}
        </View>
    );

    const renderStudents = () => (
        <View>
            <Text style={styles.sectionTitle}>Students Management</Text>
            <Text style={{color: '#64748b', marginBottom: 15}}>Select a course to view students</Text>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 20}}>
                {courses.map(course => (
                    <TouchableOpacity 
                        key={course.id} 
                        style={[styles.coursePill, selectedCourseForStudents?.id === course.id && styles.coursePillActive]}
                        onPress={() => {
                            setSelectedCourseForStudents(course);
                            if (!enrolledStudents[course.id]) fetchEnrolledStudents(course.id);
                        }}
                    >
                        <Text style={[styles.coursePillText, selectedCourseForStudents?.id === course.id && {color: '#fff'}]}>
                            {course.name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {isLoadingStudents ? (
                <ActivityIndicator size="large" color="#4361ee" style={{marginTop: 50}} />
            ) : selectedCourseForStudents && enrolledStudents[selectedCourseForStudents.id] ? (
                enrolledStudents[selectedCourseForStudents.id].map(student => (
                    <View key={student.id} style={styles.studentCard}>
                        <View style={styles.studentCardHeader}>
                            <View style={styles.studentAvatar}>
                                <Text style={{color: '#fff', fontWeight: 'bold'}}>{student.studentName?.charAt(0)}</Text>
                            </View>
                            <View style={{flex: 1, marginLeft: 10}}>
                                <Text style={styles.studentName}>{student.studentName}</Text>
                                <Text style={styles.studentCode}>{student.studentCode}</Text>
                            </View>
                            <TouchableOpacity onPress={() => removeStudentFromCourse(student.id, selectedCourseForStudents.id, student.studentName)}>
                                <Feather name="user-x" size={20} color="#ef4444" />
                            </TouchableOpacity>
                        </View>
                        
                        <View style={styles.studentStatsRow}>
                            <View style={{flex: 1}}>
                                <Text style={styles.statLabelSm}>Attendance</Text>
                                <View style={styles.progressBarBg}>
                                    <View style={[styles.progressBarFill, {width: `${student.attendanceRate}%`, backgroundColor: getRiskColor(100 - student.attendanceRate)}]} />
                                </View>
                                <Text style={styles.statValueSm}>{student.attendanceRate}%</Text>
                            </View>
                            <View style={{alignItems: 'center', marginHorizontal: 20}}>
                                <Text style={styles.statLabelSm}>Grade</Text>
                                <Text style={{fontWeight: 'bold', color: '#1e293b'}}>{student.averageGrade}%</Text>
                            </View>
                            <View style={{alignItems: 'center'}}>
                                <Text style={styles.statLabelSm}>Risk Score</Text>
                                <View style={[styles.riskCircle, {borderColor: getRiskColor(student.riskScore)}]}>
                                    <Text style={{color: getRiskColor(student.riskScore), fontWeight: 'bold'}}>{student.riskScore}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                ))
            ) : (
                <Text style={{textAlign: 'center', color: '#94a3b8', marginTop: 50}}>Select a course to view enrolled students.</Text>
            )}
        </View>
    );

    const renderLMS = () => (
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
                            {lmsMaterials.length === 0 ? <Text style={styles.emptyText}>No materials uploaded yet.</Text> : 
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
                            {lmsAssignments.length === 0 ? <Text style={styles.emptyText}>No assignments created yet.</Text> : 
                                lmsAssignments.map(ass => (
                                    <View key={ass.id} style={styles.lmsCard}>
                                        <Feather name="edit-3" size={24} color="#eab308" />
                                        <View style={{flex: 1, marginLeft: 10}}>
                                            <Text style={{fontWeight: 'bold', fontSize: 16}}>{ass.title}</Text>
                                            <Text style={{color: '#64748b', fontSize: 12}}>Due: {new Date(ass.dueDate).toLocaleDateString()} | Max Score: {ass.maxScore}</Text>
                                        </View>
                                        {ass.fileUrl && (
                                            <TouchableOpacity onPress={() => Linking.openURL(ass.fileUrl)} style={styles.downloadBtn}>
                                                <Feather name="external-link" size={16} color="#fff" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ))
                            }
                        </View>
                    )}
                </View>
            ) : (
                <Text style={{textAlign: 'center', color: '#94a3b8', marginTop: 50}}>Select a course to view LMS content.</Text>
            )}
        </View>
    );

    const renderUnderDevelopment = () => (
        <View style={styles.underDevelopment}>
            <Feather name="settings" size={60} color="#94a3b8" />
            <Text style={styles.devTitle}>This page is currently under development</Text>
            <Text style={styles.devText}>Check back soon for updates!</Text>
        </View>
    );

    if (isLoading) {
        return <View style={styles.center}><ActivityIndicator size="large" color="#4361ee" /></View>;
    }

    return (
        <SafeAreaView style={styles.container}>
            {toast.show && (
                <View style={[styles.toast, toast.type === 'error' ? styles.toastError : styles.toastSuccess]}>
                    <Text style={styles.toastText}>{toast.message}</Text>
                </View>
            )}

            <View style={styles.header}>
                <View>
                    <Text style={styles.welcomeText}>Welcome back,</Text>
                    <Text style={styles.userName}>{profData.name}</Text>
                    <Text style={styles.userIdText}>ID: {profData.code}</Text>
                    
                    <TouchableOpacity style={styles.digitalIdButton} onPress={openDigitalID}>
                        <Feather name="shield" size={14} color="#fff" />
                        <Text style={styles.digitalIdButtonText}>Digital ID</Text>
                    </TouchableOpacity>

                    {profileImage && (
                        <TouchableOpacity onPress={removeProfileImage}>
                            <Text style={styles.removeText}>Remove Photo</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity onPress={handleImageUpload}>
                    {profileImage ? (
                        <Image source={{ uri: profileImage }} style={styles.userAvatarImage} />
                    ) : (
                        <View style={styles.userAvatar}>
                            <Text style={styles.avatarText}>{profData.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}</Text>
                            <View style={styles.addPhotoBadge}><Text style={styles.addPhotoText}>+</Text></View>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topNav} contentContainerStyle={styles.topNavContent}>
                {['Dashboard', 'My Courses', 'Students', 'LMS', 'Analytics'].map(tab => (
                    <TouchableOpacity key={tab} style={[styles.navItem, activeTab === tab && styles.navItemActive]} onPress={() => setActiveTab(tab)}>
                        <Text style={[styles.navText, activeTab === tab && styles.navTextActive]}>{tab}</Text>
                    </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.navItemPassword} onPress={() => setIsPasswordModalOpen(true)}>
                    <Feather name="key" size={14} color="#4361ee" /><Text style={styles.navTextPassword}>Password</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItemLogout} onPress={handleLogout}>
                    <Feather name="log-out" size={14} color="#ef4444" /><Text style={styles.navTextLogout}>Logout</Text>
                </TouchableOpacity>
            </ScrollView>

            <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false}>
                {activeTab !== 'Students' && activeTab !== 'LMS' && (
                    <TextInput style={styles.searchInput} placeholder="Search courses..." value={searchTerm} onChangeText={setSearchTerm} />
                )}

                {activeTab === 'Dashboard' && renderDashboard()}
                {activeTab === 'My Courses' && renderMyCourses()}
                {activeTab === 'Students' && renderStudents()}
                {activeTab === 'LMS' && renderLMS()}
                {activeTab === 'Analytics' && renderUnderDevelopment()}
                
                <View style={{ height: 50 }} />
            </ScrollView>

            <Modal visible={showModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {modalType === 'attendance' ? (
                            <View style={{ alignItems: 'center' }}>
                                <Text style={styles.modalTitle}>Start Live Attendance</Text>
                                <Text style={styles.modalSubtitle}>Course: {selectedCourse?.name}</Text>
                                <View style={styles.attendanceCodeBox}>
                                    <Text style={styles.attendanceCodeText}>{attendanceCode}</Text>
                                </View>
                                <Text style={{ color: '#64748b', marginBottom: 20, textAlign: 'center' }}>
                                    Share this code. Students must be in this classroom to check in.
                                </Text>
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)} disabled={isStartingSession}>
                                        <Text style={styles.cancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[styles.submitBtn, isStartingSession && {opacity: 0.7}]} 
                                        onPress={startLiveAttendanceSession}
                                        disabled={isStartingSession}
                                    >
                                        {isStartingSession ? (
                                            <ActivityIndicator color="#fff" size="small" />
                                        ) : (
                                            <Text style={styles.submitText}>Start Session</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <ScrollView>
                                <Text style={styles.modalTitle}>Add Course</Text>
                                <TouchableOpacity style={styles.pickerButton} onPress={() => setShowCoursePicker(true)}>
                                    <Text>{newCourse.id ? `${newCourse.id} - ${newCourse.name}` : 'Select Course...'}</Text>
                                </TouchableOpacity>
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                                    <TouchableOpacity style={[styles.submitBtn, !newCourse.id && {opacity:0.5}]} onPress={saveCourse} disabled={!newCourse.id}><Text style={styles.submitText}>Save</Text></TouchableOpacity>
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            <Modal visible={showCoursePicker} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                        <Text style={styles.modalTitle}>Select a Course</Text>
                        <ScrollView>
                            {adminCourses.map(course => (
                                <TouchableOpacity key={course.id} style={styles.coursePickerItem} onPress={() => handleSelectCourseFromAdmin(course)}>
                                    <Text style={styles.coursePickerCode}>{course.courseId}</Text>
                                    <Text>{course.courseName}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={[styles.cancelBtn, {marginTop: 10}]} onPress={() => setShowCoursePicker(false)}><Text style={{textAlign: 'center'}}>Close</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={isDigitalIdModalOpen} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Digital ID</Text>
                        <View style={{alignItems: 'center', marginVertical: 20}}>
                            <QRCode 
                                value={JSON.stringify({
                                    name: profData.name,
                                    id: profData.code,
                                    role: "Professor"
                                })} 
                                size={150} 
                                color="#4361ee" 
                            />
                            <Text style={{marginTop: 15, fontWeight: 'bold', fontSize: 18}}>{profData.name}</Text>
                            <Text style={{color: '#64748b'}}>{profData.code}</Text>
                        </View>
                        <TouchableOpacity style={styles.cancelBtn} onPress={closeDigitalID}><Text style={{textAlign: 'center'}}>Close</Text></TouchableOpacity>
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
    toastSuccess: { backgroundColor: '#4361ee' }, toastError: { backgroundColor: '#ef4444' },
    toastText: { color: 'white', fontWeight: 'bold', textAlign: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#f8fafc' },
    welcomeText: { fontSize: 16, color: '#64748b' }, userName: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
    userIdText: { fontSize: 14, color: '#4361ee', fontWeight: '600', marginTop: 2 },
    removeText: { color: '#ef4444', fontSize: 12, marginTop: 5, fontWeight: 'bold' },
    userAvatar: { backgroundColor: '#4361ee', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
    userAvatarImage: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: '#4361ee' },
    avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
    addPhotoBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#4caf50', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
    addPhotoText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
    digitalIdButton: { backgroundColor: '#4a90e2', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 15, marginTop: 5, alignSelf: 'flex-start', gap: 4 },
    digitalIdButtonText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
    topNav: { backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#e2e8f0', minHeight: 65, maxHeight: 65 },
    topNavContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingRight: 30 },
    navItem: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', marginRight: 10 },
    navItemActive: { backgroundColor: '#4361ee' },
    navItemPassword: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#e8f0fe', marginRight: 10 },
    navTextPassword: { color: '#4361ee', fontWeight: '600', fontSize: 13 },
    navItemLogout: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fee2e2', marginRight: 10 },
    navText: { color: '#64748b', fontWeight: '600', fontSize: 13 }, navTextActive: { color: '#fff' },
    navTextLogout: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
    mainContent: { padding: 15 },
    searchInput: { backgroundColor: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 15 },
    quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
    actionCard: { width: '48%', padding: 15, borderRadius: 12, marginBottom: 15, alignItems: 'center', justifyContent: 'center' },
    cardBlue: { backgroundColor: '#4361ee' }, cardGreen: { backgroundColor: '#22c55e' }, cardYellow: { backgroundColor: '#eab308' }, cardRed: { backgroundColor: '#ef4444' },
    actionText: { color: '#fff', fontWeight: 'bold', marginTop: 5, fontSize: 13 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 15 },
    statCard: { width: '48%', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' },
    statLabel: { color: '#64748b', fontSize: 12, marginBottom: 5 }, statValue: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
    addBtnPrimary: { backgroundColor: '#4361ee', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
    addBtnPrimaryText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    courseCard: { backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' },
    courseHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    courseCode: { color: '#4361ee', fontWeight: 'bold' },
    courseName: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 5 },
    courseMeta: { color: '#64748b', fontSize: 13, marginVertical: 2 },
    startAttendanceBtn: { backgroundColor: '#4361ee', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 },
    startAttendanceText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    underDevelopment: { alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
    devTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginTop: 15, textAlign: 'center' },
    devText: { color: '#64748b', marginTop: 5, textAlign: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b', marginBottom: 15 },
    modalSubtitle: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 10 },
    attendanceCodeBox: { backgroundColor: '#f1f5f9', padding: 20, borderRadius: 12, borderWidth: 2, borderColor: '#4361ee', borderStyle: 'dashed', marginBottom: 15, alignItems: 'center' },
    attendanceCodeText: { fontSize: 36, fontWeight: 'bold', color: '#4361ee', letterSpacing: 8 },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 10 },
    cancelBtn: { paddingVertical: 12, borderRadius: 10, backgroundColor: '#f1f5f9', flex: 1, alignItems: 'center' },
    cancelText: { color: '#64748b', fontWeight: 'bold' },
    submitBtn: { paddingVertical: 12, borderRadius: 10, backgroundColor: '#4361ee', flex: 1, alignItems: 'center' },
    submitText: { color: '#fff', fontWeight: 'bold' },
    pickerButton: { padding: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#4a90e2', borderRadius: 8, marginBottom: 15 },
    coursePickerItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
    coursePickerCode: { fontSize: 14, fontWeight: 'bold', color: '#4361ee' },
    
    // Students & LMS Styles
    coursePill: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#e2e8f0', borderRadius: 25, marginRight: 10 },
    coursePillActive: { backgroundColor: '#4361ee' },
    coursePillText: { fontWeight: '600', color: '#475569' },
    studentCard: { backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' },
    studentCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    studentAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#94a3b8', alignItems: 'center', justifyContent: 'center' },
    studentName: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
    studentCode: { fontSize: 13, color: '#64748b' },
    studentStatsRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#f1f5f9', paddingTop: 10 },
    statLabelSm: { fontSize: 11, color: '#64748b', marginBottom: 5 },
    statValueSm: { fontSize: 12, fontWeight: 'bold', color: '#1e293b', marginTop: 4 },
    progressBarBg: { height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, width: '100%' },
    progressBarFill: { height: '100%', borderRadius: 3 },
    riskCircle: { width: 35, height: 35, borderRadius: 17.5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    lmsTabs: { flexDirection: 'row', marginBottom: 15, borderBottomWidth: 1, borderColor: '#e2e8f0' },
    lmsTab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    lmsTabActive: { borderBottomWidth: 2, borderColor: '#4361ee' },
    lmsTabText: { fontWeight: 'bold', color: '#64748b' },
    lmsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    downloadBtn: { backgroundColor: '#4361ee', padding: 10, borderRadius: 8 },
    emptyText: { textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', marginTop: 20 }
});