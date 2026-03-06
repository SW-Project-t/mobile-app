import React, { useState, useEffect } from 'react';
import { 
    View, Text, StyleSheet, ScrollView, TouchableOpacity, 
    TextInput, Modal, Alert, ActivityIndicator, 
    Platform, StatusBar, SafeAreaView, Image 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { auth, db } from './firebase'; 
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const STORAGE_KEYS = {
    COURSES: 'yallaclass_courses_student',
    UPCOMING: 'yallaclass_upcoming_student',
    ATTENDANCE: 'yallaclass_attendance_student',
    TREND: 'yallaclass_trend_student',
    PROFILE_IMAGE: 'yallaclass_student_image'
};

const defaultData = {
    courses: [
        { id: "CS401", name: "Data Structures", instructor: "Dr. Sarah Ahmed", schedule: "Mon, Wed 10:00 AM", students: 45, attendanceRate: 95, checkedIn: false, timeRemaining: 8, room: "201" },
        { id: "CS402", name: "Algorithms", instructor: "Dr. Mohammed Ali", schedule: "Tue, Thu 2:00 PM", students: 38, attendanceRate: 88, checkedIn: false, timeRemaining: 0, room: "102" }
    ],
    upcoming: [
        { id: 1, name: "Data Structures", time: "10:00 AM", room: "201", date: "Today", courseId: "CS401" }
    ],
    attendance: [
        { class: "CS402", name: "Algorithms", onTime: 15, late: 2, absences: 1, total: 18 },
        { class: "CS401", name: "Data Structures", onTime: 12, late: 4, absences: 2, total: 18 }
    ],
    trend: [
        { week: "W1", rate: 92 }, { week: "W2", rate: 88 }, { week: "W3", rate: 95 },
        { week: "W4", rate: 89 }, { week: "W5", rate: 93 }
    ]
};

export default function StudentDashboard() {
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(true);
    const [appState, setAppState] = useState(defaultData);
    const [studentData, setStudentData] = useState({ 
        name: "Loading...", 
        id: "...", 
        overallAttendance: 92, 
        enrolledCourses: 3, 
        activeSession: 1, 
        gpsActive: true 
    });
    const [profileImage, setProfileImage] = useState(null);

    const [selectedCourse, setSelectedCourse] = useState(null);
    const [modal, setModal] = useState({ show: false, type: null });
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [courseForm, setCourseForm] = useState({ id: '', name: '', instructor: '', schedule: '', room: '', students: '' });
    useEffect(() => {
        const loadSavedData = async () => {
            try {
                const savedImage = await AsyncStorage.getItem(STORAGE_KEYS.PROFILE_IMAGE);
                if (savedImage) setProfileImage(savedImage);

                const courses = await AsyncStorage.getItem(STORAGE_KEYS.COURSES);
                const upcoming = await AsyncStorage.getItem(STORAGE_KEYS.UPCOMING);
                const attendance = await AsyncStorage.getItem(STORAGE_KEYS.ATTENDANCE);
                const trend = await AsyncStorage.getItem(STORAGE_KEYS.TREND);

                setAppState({
                    courses: courses ? JSON.parse(courses) : defaultData.courses,
                    upcoming: upcoming ? JSON.parse(upcoming) : defaultData.upcoming,
                    attendance: attendance ? JSON.parse(attendance) : defaultData.attendance,
                    trend: trend ? JSON.parse(trend) : defaultData.trend
                });
                
                const parsedCourses = courses ? JSON.parse(courses) : defaultData.courses;
                if (parsedCourses.length > 0) setSelectedCourse(parsedCourses[0].id);

            } catch (error) {
                console.error("Error loading data", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadSavedData();
    }, []);
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
                            id: userData.code || "No ID"
                        }));
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
        if (!isLoading) {
            AsyncStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(appState.courses));
            AsyncStorage.setItem(STORAGE_KEYS.UPCOMING, JSON.stringify(appState.upcoming));
            AsyncStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(appState.attendance));
            AsyncStorage.setItem(STORAGE_KEYS.TREND, JSON.stringify(appState.trend));
        }
    }, [appState, isLoading]);
    useEffect(() => {
        const timer = setInterval(() => {
            setAppState(prev => {
                const newCourses = prev.courses.map(c => {
                    if (c.timeRemaining > 0) return { ...c, timeRemaining: c.timeRemaining - 1 };
                    return c;
                });
                return { ...prev, courses: newCourses };
            });
        }, 60000);
        return () => clearInterval(timer);
    }, []);
    const handleImageUpload = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert("تنبيه", "يجب إعطاء صلاحية الوصول للصور");
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
            await AsyncStorage.setItem(STORAGE_KEYS.PROFILE_IMAGE, uri);
            showNotification('Profile photo updated!');
        }
    };

    const removeProfileImage = async () => {
        setProfileImage(null);
        await AsyncStorage.removeItem(STORAGE_KEYS.PROFILE_IMAGE);
        showNotification('Photo removed');
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

    const showNotification = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };

    const handleCheckIn = (courseId) => {
        setAppState(prev => {
            const newCourses = prev.courses.map(c => {
                if (c.id === courseId && !c.checkedIn) {
                    return { ...c, checkedIn: true, attendanceRate: Math.min(100, c.attendanceRate + 1) };
                }
                return c;
            });
            return { ...prev, courses: newCourses };
        });
        setStudentData(prev => ({ ...prev, overallAttendance: Math.min(100, prev.overallAttendance + 0.5) }));
        showNotification('Checked in successfully!');
    };

    const toggleGPS = () => {
        setStudentData(prev => ({ ...prev, gpsActive: !prev.gpsActive }));
        showNotification(`GPS ${!studentData.gpsActive ? 'Activated' : 'Deactivated'}`);
    };

    const deleteCourse = (courseId) => {
        Alert.alert('Delete Course', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Delete', 
                style: 'destructive',
                onPress: () => {
                    setAppState(prev => ({
                        ...prev,
                        courses: prev.courses.filter(c => c.id !== courseId),
                    }));
                    setStudentData(prev => ({...prev, enrolledCourses: prev.enrolledCourses - 1}));
                    if (selectedCourse === courseId) setSelectedCourse(null);
                    showNotification('Course deleted');
                }
            }
        ]);
    };

    const handleAddCourse = () => {
        if (!courseForm.id || !courseForm.name) {
            showNotification('Please fill ID and Name', 'error');
            return;
        }
        const newCourse = {
            id: courseForm.id.toUpperCase(),
            name: courseForm.name,
            instructor: courseForm.instructor,
            schedule: courseForm.schedule,
            room: courseForm.room,
            students: parseInt(courseForm.students) || 0,
            attendanceRate: 0,
            checkedIn: false,
            timeRemaining: 0
        };

        setAppState(prev => ({
            ...prev,
            courses: [...prev.courses, newCourse],
        }));
        setStudentData(prev => ({...prev, enrolledCourses: prev.enrolledCourses + 1}));
        setModal({ show: false, type: null });
        setCourseForm({ id: '', name: '', instructor: '', schedule: '', room: '', students: '' });
        showNotification('Course added!');
    };

    if (isLoading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#4361ee" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {toast.show ? (
                <View style={[styles.toast, toast.type === 'error' ? styles.toastError : styles.toastSuccess]}>
                    <Text style={styles.toastText}>{toast.message}</Text>
                </View>
            ) : null}
            <View style={styles.header}>
                <View>
                    <Text style={styles.welcomeText}>Welcome back,</Text>
                    <Text style={styles.userName}>{studentData.name}</Text>
                    <Text style={styles.userIdText}>ID: {studentData.id}</Text>
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
                            <Text style={styles.avatarText}>
                                {studentData.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
                            </Text>
                            <View style={styles.addPhotoBadge}><Text style={styles.addPhotoText}>+</Text></View>
                        </View>
                    )}
                </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topNav} contentContainerStyle={styles.topNavContent}>
                <TouchableOpacity style={styles.navItemActive}>
                    <Text style={styles.navTextActive}>Dashboard</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem}>
                    <Text style={styles.navText}>My Courses</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem}>
                    <Text style={styles.navText}>Attendance</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItemLogout} onPress={handleLogout}>
                    <Text style={styles.navTextLogout}>Logout</Text>
                </TouchableOpacity>
            </ScrollView>

            <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false}>
                
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Attendance</Text>
                        <Text style={styles.statValue}>{studentData.overallAttendance}%</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Courses</Text>
                        <Text style={styles.statValue}>{studentData.enrolledCourses}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Active</Text>
                        <Text style={styles.statValue}>{studentData.activeSession}</Text>
                    </View>
                    <TouchableOpacity style={[styles.statCard, studentData.gpsActive ? styles.gpsActive : styles.gpsInactive]} onPress={toggleGPS}>
                        <Feather name="map-pin" size={24} color={studentData.gpsActive ? "#fff" : "#64748b"} />
                        <Text style={[styles.statLabel, { color: studentData.gpsActive ? "#fff" : "#64748b", marginTop: 5 }]}>
                            GPS {studentData.gpsActive ? 'ON' : 'OFF'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {appState.courses.some(c => c.timeRemaining > 0) ? (
                    <View style={styles.activeSessionCard}>
                        <View>
                            <Text style={styles.activeLabel}>Active Session Now</Text>
                            <Text style={styles.activeCourseName}>{appState.courses.find(c => c.timeRemaining > 0)?.name}</Text>
                        </View>
                        <View style={styles.timerBadge}>
                            <Text style={styles.timerText}>{appState.courses.find(c => c.timeRemaining > 0)?.timeRemaining} min</Text>
                        </View>
                    </View>
                ) : null}

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>My Courses</Text>
                    <TouchableOpacity style={styles.addBtn} onPress={() => setModal({ show: true, type: 'course' })}>
                        <Feather name="plus" size={20} color="#fff" />
                    </TouchableOpacity>
                </View>

                {appState.courses.map(course => (
                    <TouchableOpacity 
                        key={course.id} 
                        style={[styles.courseCard, selectedCourse === course.id ? styles.courseCardSelected : null]}
                        onPress={() => setSelectedCourse(course.id)}
                    >
                        <View style={styles.courseCardTop}>
                            <Text style={styles.courseCode}>{course.id}</Text>
                            <TouchableOpacity onPress={() => deleteCourse(course.id)}>
                                <Feather name="trash-2" size={18} color="#ef4444" />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.courseName}>{course.name}</Text>
                        <Text style={styles.courseInstructor}>{course.instructor}</Text>
                        
                        {selectedCourse === course.id ? (
                            <View style={styles.courseDetails}>
                                <View style={styles.detailRow}>
                                    <Feather name="clock" size={14} color="#64748b" />
                                    <Text style={styles.detailText}>{course.schedule}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Feather name="map-pin" size={14} color="#64748b" />
                                    <Text style={styles.detailText}>Room {course.room}</Text>
                                </View>
                                <View style={styles.checkInArea}>
                                    <View style={styles.rateCircle}>
                                        <Text style={styles.rateText}>{course.attendanceRate}%</Text>
                                    </View>
                                    <TouchableOpacity 
                                        style={[styles.checkInBtn, course.checkedIn ? styles.checkInBtnDisabled : null]}
                                        onPress={() => handleCheckIn(course.id)}
                                        disabled={course.checkedIn}
                                    >
                                        <Text style={styles.checkInText}>{course.checkedIn ? 'Checked In' : 'Check In'}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : null}
                    </TouchableOpacity>
                ))}

                <Text style={[styles.sectionTitle, { marginTop: 20, marginBottom: 15 }]}>Attendance Records</Text>
                {appState.attendance.map((item, idx) => (
                    <View key={idx} style={styles.recordCard}>
                        <View style={styles.recordHeader}>
                            <Text style={styles.recordClass}>{item.class}</Text>
                            <Text style={styles.recordName}>{item.name}</Text>
                        </View>
                        <View style={styles.recordStats}>
                            <View style={styles.rStat}>
                                <Text style={styles.rsNum}>{item.onTime}</Text>
                                <Text style={styles.rsLabel}>On Time</Text>
                            </View>
                            <View style={styles.rStat}>
                                <Text style={[styles.rsNum, {color: '#f59e0b'}]}>{item.late}</Text>
                                <Text style={styles.rsLabel}>Late</Text>
                            </View>
                            <View style={styles.rStat}>
                                <Text style={[styles.rsNum, {color: '#ef4444'}]}>{item.absences}</Text>
                                <Text style={styles.rsLabel}>Absence</Text>
                            </View>
                        </View>
                    </View>
                ))}

                <View style={{ height: 50 }} />
            </ScrollView>

            <Modal visible={modal.show && modal.type === 'course'} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Add New Course</Text>
                        <TextInput style={styles.input} placeholder="Course ID (e.g., CS404)" value={courseForm.id} onChangeText={t => setCourseForm({...courseForm, id: t})} />
                        <TextInput style={styles.input} placeholder="Course Name" value={courseForm.name} onChangeText={t => setCourseForm({...courseForm, name: t})} />
                        <TextInput style={styles.input} placeholder="Instructor" value={courseForm.instructor} onChangeText={t => setCourseForm({...courseForm, instructor: t})} />
                        <TextInput style={styles.input} placeholder="Schedule (e.g., Mon 10 AM)" value={courseForm.schedule} onChangeText={t => setCourseForm({...courseForm, schedule: t})} />
                        
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal({ show: false, type: null })}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.submitBtn} onPress={handleAddCourse}>
                                <Text style={styles.submitText}>Add Course</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: '#f8fafc',
        paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 40) + 10 : 45 
    },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    toast: { position: 'absolute', top: 50, left: 20, right: 20, padding: 15, borderRadius: 10, zIndex: 1000, elevation: 5 },
    toastSuccess: { backgroundColor: '#22c55e' },
    toastError: { backgroundColor: '#ef4444' },
    toastText: { color: 'white', fontWeight: 'bold', textAlign: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#f8fafc' },
    welcomeText: { fontSize: 16, color: '#64748b' },
    userName: { fontSize: 24, fontWeight: 'bold', color: '#1e293b' },
    userIdText: { fontSize: 14, color: '#4361ee', fontWeight: '600', marginTop: 2 },
    removeText: { color: '#ef4444', fontSize: 12, marginTop: 5, fontWeight: 'bold' },
    userAvatar: { backgroundColor: '#4361ee', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', position: 'relative' },
    userAvatarImage: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: '#4361ee' },
    avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
    addPhotoBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#10b981', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
    addPhotoText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
    topNav: { 
        backgroundColor: '#fff', 
        paddingVertical: 12, 
        borderBottomWidth: 1, 
        borderColor: '#e2e8f0',
        minHeight: 65,
        maxHeight: 65
    },
    topNavContent: { 
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingRight: 30,
    },
    navItem: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', marginRight: 10 },
    navItemActive: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#4361ee', marginRight: 10 },
    navItemLogout: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fee2e2', marginRight: 10 },
    navText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
    navTextActive: { color: '#fff', fontWeight: '600', fontSize: 13 },
    navTextLogout: { color: '#ef4444', fontWeight: '600', fontSize: 13 },

    mainContent: { padding: 20 },

    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
    statCard: { width: '48%', backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 } },
    statLabel: { color: '#64748b', fontSize: 13, marginBottom: 5 },
    statValue: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
    gpsActive: { backgroundColor: '#4361ee', alignItems: 'center', justifyContent: 'center' },
    gpsInactive: { alignItems: 'center', justifyContent: 'center' },

    activeSessionCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#eff6ff', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 20 },
    activeLabel: { color: '#2563eb', fontWeight: 'bold', fontSize: 12 },
    activeCourseName: { color: '#1e3a8a', fontWeight: 'bold', fontSize: 16, marginTop: 4 },
    timerBadge: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#bfdbfe' },
    timerText: { color: '#2563eb', fontWeight: 'bold' },

    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
    addBtn: { backgroundColor: '#4361ee', width: 35, height: 35, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

    courseCard: { backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
    courseCardSelected: { borderColor: '#4361ee', borderWidth: 2 },
    courseCardTop: { flexDirection: 'row', justifyContent: 'space-between' },
    courseCode: { color: '#4361ee', fontWeight: 'bold', fontSize: 12 },
    courseName: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginTop: 5 },
    courseInstructor: { color: '#64748b', fontSize: 13, marginTop: 2 },
    
    courseDetails: { marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderColor: '#e2e8f0' },
    detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    detailText: { marginLeft: 8, color: '#475569', fontSize: 13 },
    checkInArea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
    rateCircle: { backgroundColor: '#f1f5f9', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
    rateText: { fontWeight: 'bold', color: '#1e293b' },
    checkInBtn: { backgroundColor: '#4361ee', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25 },
    checkInBtnDisabled: { backgroundColor: '#94a3b8' },
    checkInText: { color: '#fff', fontWeight: 'bold' },

    recordCard: { backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    recordHeader: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#f1f5f9', paddingBottom: 10, marginBottom: 10 },
    recordClass: { fontWeight: 'bold', color: '#4361ee' },
    recordName: { color: '#475569', fontSize: 13 },
    recordStats: { flexDirection: 'row', justifyContent: 'space-between' },
    rStat: { alignItems: 'center' },
    rsNum: { fontSize: 18, fontWeight: 'bold', color: '#22c55e' },
    rsLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 20 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 15 },
    input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, marginBottom: 12, color: '#1e293b' },
    modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 10 },
    cancelBtn: { padding: 12, borderRadius: 10, backgroundColor: '#f1f5f9' },
    cancelText: { color: '#64748b', fontWeight: 'bold' },
    submitBtn: { padding: 12, borderRadius: 10, backgroundColor: '#4361ee' },
    submitText: { color: '#fff', fontWeight: 'bold' }
});