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
            if (error.code === 'auth/wrong-password') {
                showNotification("Current password is incorrect!", 'error');
            } else {
                showNotification("Error updating password. Please try again.", 'error');
            }
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

    const openDigitalID = () => {
        setIsDigitalIdModalOpen(true);
    };

    const closeDigitalID = () => {
        setIsDigitalIdModalOpen(false);
    };

    const resetDailyAttendance = (courseId) => {
        setCourses(courses.map(c => 
            c.id === courseId ? { ...c, todayPresent: 0, todayLate: 0, todayAbsent: 0 } : c
        ));
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

    const openAttendanceModal = (course) => {
        setModalType('attendance');
        setSelectedCourse(course);
        setShowModal(true);
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
                        
                        try {
                            const q = query(
                                collection(db, "professorCourses"), 
                                where("professorId", "==", user.uid),
                                where("courseId", "==", id)
                            );
                            const querySnapshot = await getDocs(q);
                            
                            querySnapshot.forEach(async (document) => {
                                await deleteDoc(doc(db, "professorCourses", document.id));
                            });
                            
                            showNotification(`Course ${id} deleted successfully`);
                        } catch (firestoreError) {
                            console.error("Firestore delete error:", firestoreError);
                            showNotification('Course deleted locally but failed to delete from database', 'warning');
                        }
                    } catch (error) {
                        console.error("Error deleting course:", error);
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

        const courseExists = courses.some(c => c.id === newCourse.id);
        if (courseExists) {
            showNotification('This course is already in your list', 'error');
            return;
        }

        try {
            const user = auth.currentUser;
            if (!user) {
                showNotification('You must be logged in', 'error');
                return;
            }

            const courseToAdd = {
                courseId: newCourse.id,
                courseName: newCourse.name,
                schedule: newCourse.schedule,
                room: newCourse.room,
                capacity: parseInt(newCourse.capacity) || 0,
                students: parseInt(newCourse.students) || 0,
                avgAttendance: 0,
                todayPresent: 0,
                todayLate: 0,
                todayAbsent: 0,
                professorId: user.uid,
                professorName: profData.name,
                professorCode: profData.code,
                assignedAt: new Date().toISOString()
            };

            setCourses(prev => [...prev, courseToAdd]);
            
            try {
                await addDoc(collection(db, "professorCourses"), {
                    ...courseToAdd,
                    userId: user.uid
                });    
                showNotification(`Course ${newCourse.id} added successfully`);
            } catch (firestoreError) {
                console.error("Firestore error:", firestoreError);
                showNotification('Course added locally but failed to save to database', 'warning');
            }

            setShowModal(false);
            setNewCourse({ id: '', name: '', schedule: '', room: '', students: '', capacity: '' });

        } catch (error) {
            console.error("Error saving course:", error);
            showNotification('Error saving course. Please try again.', 'error');
        }
    };

    const updateAttendance = (courseId, type) => {
        setCourses(courses.map(c => {
            if (c.id === courseId) {
                if (type === 'present') return { ...c, todayPresent: c.todayPresent + 1 };
                if (type === 'late') return { ...c, todayLate: c.todayLate + 1 };
                if (type === 'absent') return { ...c, todayAbsent: c.todayAbsent + 1 };
            }
            return c;
        }));
        showNotification(`Attendance updated for ${courseId}`);
    };

    const exportData = () => {
        const dataStr = JSON.stringify(courses, null, 2);
        Alert.alert('Export Data', 'Data copied to clipboard. You can paste it anywhere.', [
            { text: 'OK' }
        ]);
        showNotification('Data exported to console');
        console.log('Exported Courses:', courses);
    };

    const totalStudents = courses.reduce((sum, c) => sum + (c.students || 0), 0);
    const avgAttendance = Math.round(courses.reduce((sum, c) => sum + (c.avgAttendance || 0), 0) / (courses.length || 1));
    const totalPresent = courses.reduce((sum, c) => sum + (c.todayPresent || 0), 0);

    const weeklyData = [
        { day: 'Mon', value: 92 },
        { day: 'Tue', value: 88 },
        { day: 'Wed', value: 95 },
        { day: 'Thu', value: 89 },
        { day: 'Fri', value: 93 }
    ];

    const renderDashboard = () => (
        <View>
            <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Total Courses</Text>
                    <Text style={styles.statValue}>{courses.length}</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Total Students</Text>
                    <Text style={styles.statValue}>{totalStudents}</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Avg Attendance</Text>
                    <Text style={styles.statValue}>{avgAttendance}%</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Present Today</Text>
                    <Text style={styles.statValue}>{totalPresent}</Text>
                </View>
            </View>

            <View style={styles.quickActionsGrid}>
                <TouchableOpacity style={[styles.actionCard, styles.cardBlue]} onPress={openAddModal}>
                    <Feather name="book-open" size={28} color="#fff" />
                    <Text style={styles.actionText}>New Course</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionCard, styles.cardGreen]} onPress={exportData}>
                    <Feather name="download" size={28} color="#fff" />
                    <Text style={styles.actionText}>Export Data</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionCard, styles.cardYellow]} onPress={resetAllAttendance}>
                    <Feather name="clock" size={28} color="#fff" />
                    <Text style={styles.actionText}>Reset Today</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>My Courses</Text>
                <TouchableOpacity onPress={() => setActiveTab('My Courses')}>
                    <Text style={styles.viewAllText}>View All</Text>
                </TouchableOpacity>
            </View>

            {filteredCourses.slice(0, 3).map(course => (
                <View key={course.id} style={styles.courseCard}>
                    <View style={styles.courseHeader}>
                        <Text style={styles.courseCode}>{course.id}</Text>
                        <View style={styles.courseHeaderActions}>
                            <TouchableOpacity onPress={() => deleteCourse(course.id)} style={styles.iconButton}>
                                <Feather name="trash-2" size={16} color="#ef4444" />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <Text style={styles.courseName}>{course.name}</Text>
                    <View style={styles.courseDetails}>
                        <Text style={styles.courseMeta}>
                            <Feather name="clock" size={12} /> {course.schedule}
                        </Text>
                        <Text style={styles.courseMeta}>
                            <Feather name="calendar" size={12} /> {course.room}
                        </Text>
                    </View>
                    
                    <View style={styles.attendanceSummary}>
                        <View style={styles.attendanceItemPresent}>
                            <Feather name="check-circle" size={14} color="#22c55e" />
                            <Text style={styles.attendanceText}>{course.todayPresent} Present</Text>
                        </View>
                        <View style={styles.attendanceItemLate}>
                            <Feather name="alert-circle" size={14} color="#eab308" />
                            <Text style={styles.attendanceText}>{course.todayLate} Late</Text>
                        </View>
                        <View style={styles.attendanceItemAbsent}>
                            <Feather name="x-circle" size={14} color="#ef4444" />
                            <Text style={styles.attendanceText}>{course.todayAbsent} Absent</Text>
                        </View>
                    </View>

                    <TouchableOpacity style={styles.startAttendanceBtn} onPress={() => openAttendanceModal(course)}>
                        <Text style={styles.startAttendanceText}>Start Attendance</Text>
                    </TouchableOpacity>
                </View>
            ))}

            <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                    <Text style={styles.chartTitle}>Weekly Attendance Overview</Text>
                    <Text style={styles.chartBadge}>Last 5 days</Text>
                </View>
                <View style={styles.chartBars}>
                    {weeklyData.map((item, i) => (
                        <View key={i} style={styles.barItem}>
                            <View style={[styles.bar, { height: item.value * 2 }]} />
                            <Text style={styles.barDay}>{item.day}</Text>
                            <Text style={styles.barValue}>{item.value}%</Text>
                        </View>
                    ))}
                </View>
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
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No courses found.</Text>
                </View>
            ) : (
                filteredCourses.map(course => (
                    <View key={course.id} style={styles.courseCard}>
                        <View style={styles.courseHeader}>
                            <Text style={styles.courseCode}>{course.id}</Text>
                            <Text style={styles.courseSchedule}>{course.schedule}</Text>
                        </View>
                        <Text style={styles.courseName}>{course.name}</Text>
                        <Text style={styles.courseMeta}>{course.room} • {course.students} Students</Text>
                        
                        <View style={styles.attendanceBadge}>
                            <Text style={styles.attendanceBadgeText}>Avg: {course.avgAttendance}%</Text>
                        </View>

                        <View style={styles.attendanceButtons}>
                            <TouchableOpacity style={styles.btnPresent} onPress={() => updateAttendance(course.id, 'present')}>
                                <Text style={styles.btnTextSmall}>+Present</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.btnLate} onPress={() => updateAttendance(course.id, 'late')}>
                                <Text style={styles.btnTextSmall}>+Late</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.btnAbsent} onPress={() => updateAttendance(course.id, 'absent')}>
                                <Text style={styles.btnTextSmall}>+Absent</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.todayStats}>
                            <Text style={styles.statP}>{course.todayPresent} P</Text>
                            <Text style={styles.statL}>{course.todayLate} L</Text>
                            <Text style={styles.statA}>{course.todayAbsent} A</Text>
                        </View>

                        <View style={styles.actionButtonsRow}>
                            <TouchableOpacity style={styles.btnStart} onPress={() => openAttendanceModal(course)}>
                                <Text style={styles.btnTextWhite}>Start</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.btnReset} onPress={() => resetDailyAttendance(course.id)}>
                                <Text style={styles.btnTextBlue}>Reset</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.btnDelete} onPress={() => deleteCourse(course.id)}>
                                <Text style={styles.btnTextRed}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))
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
                            <Text style={styles.avatarText}>
                                {profData.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
                            </Text>
                            <View style={styles.addPhotoBadge}>
                                <Text style={styles.addPhotoText}>+</Text>
                            </View>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topNav} contentContainerStyle={styles.topNavContent}>
                <TouchableOpacity 
                    style={[styles.navItem, activeTab === 'Dashboard' && styles.navItemActive]} 
                    onPress={() => setActiveTab('Dashboard')}
                >
                    <Text style={[styles.navText, activeTab === 'Dashboard' && styles.navTextActive]}>Dashboard</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.navItem, activeTab === 'My Courses' && styles.navItemActive]} 
                    onPress={() => setActiveTab('My Courses')}
                >
                    <Text style={[styles.navText, activeTab === 'My Courses' && styles.navTextActive]}>My Courses</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.navItem, activeTab === 'Schedule' && styles.navItemActive]} 
                    onPress={() => setActiveTab('Schedule')}
                >
                    <Text style={[styles.navText, activeTab === 'Schedule' && styles.navTextActive]}>Schedule</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.navItem, activeTab === 'Analytics' && styles.navItemActive]} 
                    onPress={() => setActiveTab('Analytics')}
                >
                    <Text style={[styles.navText, activeTab === 'Analytics' && styles.navTextActive]}>Analytics</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.navItem, activeTab === 'Settings' && styles.navItemActive]} 
                    onPress={() => setActiveTab('Settings')}
                >
                    <Text style={[styles.navText, activeTab === 'Settings' && styles.navTextActive]}>Settings</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.navItemPassword} onPress={() => setIsPasswordModalOpen(true)}>
                    <Feather name="key" size={14} color="#4361ee" />
                    <Text style={styles.navTextPassword}>Change Password</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.navItemLogout} onPress={handleLogout}>
                    <Feather name="log-out" size={14} color="#ef4444" />
                    <Text style={styles.navTextLogout}>Logout</Text>
                </TouchableOpacity>
            </ScrollView>

            <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search courses..."
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                />

                {activeTab === 'Dashboard' && renderDashboard()}
                {activeTab === 'My Courses' && renderMyCourses()}
                {(activeTab === 'Students' || activeTab === 'Schedule' || activeTab === 'Analytics' || activeTab === 'Settings') && renderUnderDevelopment()}
                
                <View style={{ height: 50 }} />
            </ScrollView>

            <Modal visible={isPasswordModalOpen} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Change Password</Text>
                        
                        <TextInput 
                            style={styles.input} 
                            placeholder="Current Password"
                            secureTextEntry
                            value={passwordFields.currentPassword}
                            onChangeText={(t) => handlePasswordInputChange('currentPassword', t)}
                        />
                        <TextInput 
                            style={styles.input} 
                            placeholder="New Password"
                            secureTextEntry
                            value={passwordFields.newPassword}
                            onChangeText={(t) => handlePasswordInputChange('newPassword', t)}
                        />
                        <TextInput 
                            style={styles.input} 
                            placeholder="Confirm Password"
                            secureTextEntry
                            value={passwordFields.confirmPassword}
                            onChangeText={(t) => handlePasswordInputChange('confirmPassword', t)}
                        />
                        
                        <Text style={styles.passwordRequirement}>
                            Password must be at least 6 characters long
                        </Text>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsPasswordModalOpen(false)}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.submitBtn} onPress={handlePasswordUpdate}>
                                <Text style={styles.submitText}>Update</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={isDigitalIdModalOpen} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, styles.digitalIdModal]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Professor Digital ID Card</Text>
                            <TouchableOpacity onPress={closeDigitalID} style={styles.closeButton}>
                                <Feather name="x" size={20} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.idCardHeader}>
                            <View style={styles.idSchool}>
                                <Feather name="home" size={24} color="#4361ee" />
                                <View>
                                    <Text style={styles.idSchoolName}>Cairo University</Text>
                                    <Text style={styles.idCardType}>Professor Identification Card</Text>
                                </View>
                            </View>
                            <Feather name="shield" size={32} color="#4361ee" />
                        </View>

                        <View style={styles.idCardBody}>
                            <View style={styles.idPhotoSection}>
                                {profileImage ? (
                                    <Image source={{ uri: profileImage }} style={styles.idPhoto} />
                                ) : (
                                    <View style={styles.idPhotoPlaceholder}>
                                        <Text style={styles.idPhotoPlaceholderText}>
                                            {profData.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            <View style={styles.idInfoSection}>
                                <View style={styles.idField}>
                                    <Text style={styles.idFieldLabel}>Professor Name</Text>
                                    <Text style={styles.idFieldValue}>{profData.name}</Text>
                                </View>
                                <View style={styles.idField}>
                                    <Text style={styles.idFieldLabel}>Professor ID</Text>
                                    <Text style={styles.idFieldValue}>{profData.code}</Text>
                                </View>
                                <View style={styles.idField}>
                                    <Text style={styles.idFieldLabel}>Department</Text>
                                    <Text style={styles.idFieldValue}>Computer Science</Text>
                                </View>
                                <View style={styles.idField}>
                                    <Text style={styles.idFieldLabel}>Email</Text>
                                    <Text style={styles.idFieldValue}>{auth.currentUser?.email || 'professor@yallaclass.com'}</Text>
                                </View>
                                <View style={styles.idField}>
                                    <Text style={styles.idFieldLabel}>Courses</Text>
                                    <Text style={styles.idFieldValue}>{courses.length} Active Courses</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.idCardFooter}>
                            <View style={styles.idQRLarge}>
                                <QRCode
                                    value={JSON.stringify({
                                        name: profData.name,
                                        id: profData.code,
                                        email: auth.currentUser?.email,
                                        department: 'Computer Science',
                                        university: 'Cairo University'
                                    })}
                                    size={70}
                                    color="#4361ee"
                                    backgroundColor="white"
                                />
                            </View>
                            <View style={styles.idValidity}>
                                <View style={styles.idValidityBadge}>
                                    <Feather name="check-circle" size={16} color="#22c55e" />
                                    <Text style={styles.idValidityText}>FACULTY ID 2026</Text>
                                </View>
                                <Text style={styles.idScanText}>Scan QR code to verify faculty identity</Text>
                                <Text style={styles.idIssueDate}>Issued: March 2026 | Valid through: 2028</Text>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.closeIdButton} onPress={closeDigitalID}>
                            <Text style={styles.closeIdButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={showModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, modalType === 'attendance' && styles.modalContentCentered]}>
                        {modalType === 'attendance' ? (
                            <View style={{ alignItems: 'center' }}>
                                <Text style={styles.modalTitle}>Start Attendance Session</Text>
                                <Text style={styles.modalSubtitle}>Course: {selectedCourse?.name}</Text>
                                <View style={styles.attendanceCodeBox}>
                                    <Text style={styles.attendanceCodeText}>2478</Text>
                                </View>
                                <Text style={styles.modalInstruction}>Share this 4-digit code with your students</Text>
                                
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                                        <Text style={styles.cancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.submitBtn} onPress={() => { 
                                        showNotification('Attendance session started successfully!'); 
                                        setShowModal(false); 
                                    }}>
                                        <Text style={styles.submitText}>Start Session</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <Text style={styles.modalTitle}>{modalType === 'add' ? 'Add New Course' : 'Edit Course'}</Text>
                                
                                {modalType === 'add' && (
                                    <View style={styles.selectCourseContainer}>
                                        <Text style={styles.selectCourseLabel}>Select Course You Want To Teach</Text>
                                        
                                        <TouchableOpacity 
                                            style={styles.pickerButton}
                                            onPress={() => setShowCoursePicker(true)}
                                        >
                                            <Text style={newCourse.id ? styles.pickerTextSelected : styles.pickerTextPlaceholder}>
                                                {newCourse.id ? `${newCourse.id} - ${newCourse.name}` : '-- Choose a Course --'}
                                            </Text>
                                            <Feather name="chevron-down" size={20} color="#64748b" />
                                        </TouchableOpacity>
                                    </View>
                                )}

                                <TextInput 
                                    style={styles.input} 
                                    placeholder="Course ID" 
                                    value={newCourse.id}
                                    editable={false}
                                />
                                <TextInput 
                                    style={styles.input} 
                                    placeholder="Course Name" 
                                    value={newCourse.name}
                                    editable={false}
                                />
                                <TextInput 
                                    style={styles.input} 
                                    placeholder="Schedule" 
                                    value={newCourse.schedule}
                                    editable={false}
                                />
                                <TextInput 
                                    style={styles.input} 
                                    placeholder="Room" 
                                    value={newCourse.room}
                                    editable={false}
                                />
                                <TextInput 
                                    style={styles.input} 
                                    placeholder="Capacity" 
                                    value={String(newCourse.capacity || '')}
                                    editable={false}
                                />
                                
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                                        <Text style={styles.cancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[styles.submitBtn, modalType === 'add' && !newCourse.id && styles.disabledBtn]} 
                                        onPress={saveCourse}
                                        disabled={modalType === 'add' && !newCourse.id}
                                    >
                                        <Text style={styles.submitText}>
                                            {modalType === 'add' ? 'Confirm Addition' : 'Save Changes'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            <Modal visible={showCoursePicker} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select a Course</Text>
                            <TouchableOpacity onPress={() => setShowCoursePicker(false)} style={styles.closeButton}>
                                <Feather name="x" size={20} color="#64748b" />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView>
                            {adminCourses.map((course) => (
                                <TouchableOpacity
                                    key={course.id}
                                    style={styles.coursePickerItem}
                                    onPress={() => handleSelectCourseFromAdmin(course)}
                                >
                                    <View>
                                        <Text style={styles.coursePickerCode}>{course.courseId}</Text>
                                        <Text style={styles.coursePickerName}>{course.courseName}</Text>
                                        {course.schedule && (
                                            <Text style={styles.coursePickerDetails}>
                                                {course.schedule} | {course.RoomNumber || 'No Room'}
                                            </Text>
                                        )}
                                    </View>
                                    <Feather name="check" size={20} color="#4361ee" />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
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
    center: { 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: '#f8fafc' 
    },
    
    toast: { 
        position: 'absolute', 
        top: 50, 
        left: 20, 
        right: 20, 
        padding: 15, 
        borderRadius: 10, 
        zIndex: 1000, 
        elevation: 5 
    },
    toastSuccess: { 
        backgroundColor: '#4361ee' 
    },
    toastError: { 
        backgroundColor: '#ef4444' 
    },
    toastText: { 
        color: 'white', 
        fontWeight: 'bold', 
        textAlign: 'center' 
    },

    header: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        paddingHorizontal: 20, 
        paddingBottom: 15, 
        backgroundColor: '#f8fafc' 
    },
    welcomeText: { 
        fontSize: 16, 
        color: '#64748b' 
    },
    userName: { 
        fontSize: 22, 
        fontWeight: 'bold', 
        color: '#1e293b' 
    },
    userIdText: { 
        fontSize: 14, 
        color: '#4361ee', 
        fontWeight: '600', 
        marginTop: 2 
    },
    removeText: { 
        color: '#ef4444', 
        fontSize: 12, 
        marginTop: 5, 
        fontWeight: 'bold' 
    },
    userAvatar: { 
        backgroundColor: '#4361ee', 
        width: 56, 
        height: 56, 
        borderRadius: 28, 
        justifyContent: 'center', 
        alignItems: 'center', 
        position: 'relative' 
    },
    userAvatarImage: { 
        width: 56, 
        height: 56, 
        borderRadius: 28, 
        borderWidth: 2, 
        borderColor: '#4361ee' 
    },
    avatarText: { 
        color: '#fff', 
        fontWeight: 'bold', 
        fontSize: 18 
    },
    addPhotoBadge: { 
        position: 'absolute', 
        bottom: -2, 
        right: -2, 
        backgroundColor: '#4caf50', 
        width: 22, 
        height: 22, 
        borderRadius: 11, 
        justifyContent: 'center', 
        alignItems: 'center', 
        borderWidth: 2, 
        borderColor: '#fff' 
    },
    addPhotoText: { 
        color: '#fff', 
        fontSize: 14, 
        fontWeight: 'bold' 
    },

    digitalIdButton: {
        backgroundColor: '#4a90e2',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 15,
        marginTop: 5,
        alignSelf: 'flex-start',
        gap: 4
    },
    digitalIdButtonText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold'
    },

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
        paddingRight: 30 
    },
    navItem: { 
        paddingHorizontal: 18, 
        paddingVertical: 8, 
        borderRadius: 20, 
        backgroundColor: '#f1f5f9', 
        marginRight: 10 
    },
    navItemActive: { 
        backgroundColor: '#4361ee' 
    },
    navItemPassword: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 18,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#e8f0fe',
        marginRight: 10
    },
    navTextPassword: {
        color: '#4361ee',
        fontWeight: '600',
        fontSize: 13
    },
    navItemLogout: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 18,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#fee2e2',
        marginRight: 10
    },
    navText: { 
        color: '#64748b', 
        fontWeight: '600', 
        fontSize: 13 
    },
    navTextActive: { 
        color: '#fff' 
    },
    navTextLogout: { 
        color: '#ef4444', 
        fontWeight: '600', 
        fontSize: 13 
    },

    mainContent: { 
        padding: 15 
    },
    searchInput: { 
        backgroundColor: '#fff', 
        padding: 12, 
        borderRadius: 10, 
        borderWidth: 1, 
        borderColor: '#e2e8f0', 
        marginBottom: 15 
    },

    quickActionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 20
    },
    actionCard: {
        width: '48%',
        padding: 15,
        borderRadius: 12,
        marginBottom: 15,
        alignItems: 'center',
        justifyContent: 'center'
    },
    cardBlue: {
        backgroundColor: '#4361ee'
    },
    cardGreen: {
        backgroundColor: '#22c55e'
    },
    cardYellow: {
        backgroundColor: '#eab308'
    },
    cardRed: {
        backgroundColor: '#ef4444'
    },
    actionText: {
        color: '#fff',
        fontWeight: 'bold',
        marginTop: 5,
        fontSize: 13
    },
    statsGrid: { 
        flexDirection: 'row', 
        flexWrap: 'wrap', 
        justifyContent: 'space-between', 
        marginBottom: 15 
    },
    statCard: { 
        width: '48%', 
        backgroundColor: '#fff', 
        padding: 15, 
        borderRadius: 12, 
        marginBottom: 15, 
        borderWidth: 1, 
        borderColor: '#e2e8f0' 
    },
    statLabel: { 
        color: '#64748b', 
        fontSize: 12, 
        marginBottom: 5 
    },
    statValue: { 
        fontSize: 20, 
        fontWeight: 'bold', 
        color: '#1e293b' 
    },

    sectionHeader: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 15 
    },
    sectionTitle: { 
        fontSize: 18, 
        fontWeight: 'bold', 
        color: '#1e293b' 
    },
    viewAllText: {
        color: '#4361ee',
        fontWeight: '600'
    },
    addBtnPrimary: { 
        backgroundColor: '#4361ee', 
        paddingHorizontal: 15, 
        paddingVertical: 8, 
        borderRadius: 8 
    },
    addBtnPrimaryText: { 
        color: '#fff', 
        fontWeight: 'bold', 
        fontSize: 13 
    },

    courseCard: { 
        backgroundColor: '#fff', 
        padding: 15, 
        borderRadius: 16, 
        marginBottom: 15, 
        borderWidth: 1, 
        borderColor: '#e2e8f0' 
    },
    courseHeader: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 8 
    },
    courseHeaderActions: {
        flexDirection: 'row',
        gap: 8
    },
    iconButton: {
        padding: 5
    },
    courseCode: { 
        color: '#4361ee', 
        fontWeight: 'bold' 
    },
    courseSchedule: { 
        backgroundColor: '#f1f5f9', 
        paddingHorizontal: 8, 
        paddingVertical: 2, 
        borderRadius: 10, 
        fontSize: 11, 
        color: '#64748b' 
    },
    courseName: { 
        fontSize: 18, 
        fontWeight: 'bold', 
        color: '#1e293b', 
        marginBottom: 5 
    },
    courseMeta: { 
        color: '#64748b', 
        fontSize: 13,
        marginVertical: 2
    },
    courseDetails: {
        marginVertical: 5
    },
    
    attendanceBadge: { 
        backgroundColor: '#f1f5f9', 
        alignSelf: 'flex-start', 
        paddingHorizontal: 12, 
        paddingVertical: 5, 
        borderRadius: 15, 
        marginTop: 10 
    },
    attendanceBadgeText: { 
        color: '#4361ee', 
        fontWeight: 'bold', 
        fontSize: 12 
    },

    attendanceButtons: { 
        flexDirection: 'row', 
        gap: 8, 
        marginTop: 15 
    },
    btnPresent: { 
        backgroundColor: '#22c55e', 
        paddingHorizontal: 10, 
        paddingVertical: 6, 
        borderRadius: 6 
    },
    btnLate: { 
        backgroundColor: '#eab308', 
        paddingHorizontal: 10, 
        paddingVertical: 6, 
        borderRadius: 6 
    },
    btnAbsent: { 
        backgroundColor: '#ef4444', 
        paddingHorizontal: 10, 
        paddingVertical: 6, 
        borderRadius: 6 
    },
    btnTextSmall: { 
        color: '#fff', 
        fontSize: 11, 
        fontWeight: 'bold' 
    },

    todayStats: { 
        flexDirection: 'row', 
        gap: 15, 
        backgroundColor: '#f8fafc', 
        padding: 10, 
        borderRadius: 8, 
        marginTop: 10 
    },
    statP: { 
        color: '#22c55e', 
        fontWeight: 'bold', 
        fontSize: 12 
    },
    statL: { 
        color: '#eab308', 
        fontWeight: 'bold', 
        fontSize: 12 
    },
    statA: { 
        color: '#ef4444', 
        fontWeight: 'bold', 
        fontSize: 12 
    },

    attendanceSummary: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#f8fafc',
        padding: 10,
        borderRadius: 8,
        marginTop: 10,
        marginBottom: 10
    },
    attendanceItemPresent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4
    },
    attendanceItemLate: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4
    },
    attendanceItemAbsent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4
    },
    attendanceText: {
        fontSize: 11,
        color: '#1e293b'
    },

    startAttendanceBtn: {
        backgroundColor: '#4361ee',
        padding: 10,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 5
    },
    startAttendanceText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 13
    },

    actionButtonsRow: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        marginTop: 15, 
        borderTopWidth: 1, 
        borderColor: '#f1f5f9', 
        paddingTop: 15 
    },
    btnStart: { 
        backgroundColor: '#4361ee', 
        paddingHorizontal: 15, 
        paddingVertical: 8, 
        borderRadius: 8, 
        flex: 1, 
        marginRight: 5, 
        alignItems: 'center' 
    },
    btnReset: { 
        backgroundColor: '#fff', 
        borderWidth: 1, 
        borderColor: '#4361ee', 
        paddingHorizontal: 15, 
        paddingVertical: 8, 
        borderRadius: 8, 
        flex: 1, 
        marginHorizontal: 5, 
        alignItems: 'center' 
    },
    btnDelete: { 
        backgroundColor: '#fee2e2', 
        paddingHorizontal: 15, 
        paddingVertical: 8, 
        borderRadius: 8, 
        flex: 1, 
        marginLeft: 5, 
        alignItems: 'center' 
    },
    btnTextWhite: { 
        color: '#fff', 
        fontWeight: 'bold', 
        fontSize: 12 
    },
    btnTextBlue: { 
        color: '#4361ee', 
        fontWeight: 'bold', 
        fontSize: 12 
    },
    btnTextRed: { 
        color: '#ef4444', 
        fontWeight: 'bold', 
        fontSize: 12 
    },

    chartCard: {
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 16,
        marginTop: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0'
    },
    chartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15
    },
    chartTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1e293b'
    },
    chartBadge: {
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        fontSize: 11,
        color: '#64748b'
    },
    chartBars: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-end',
        height: 200
    },
    barItem: {
        alignItems: 'center',
        width: 40
    },
    bar: {
        width: 20,
        backgroundColor: '#4361ee',
        borderRadius: 10,
        marginBottom: 5
    },
    barDay: {
        fontSize: 12,
        color: '#64748b'
    },
    barValue: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#1e293b',
        marginTop: 2
    },

    emptyState: { 
        padding: 30, 
        alignItems: 'center', 
        backgroundColor: '#fff', 
        borderRadius: 12, 
        borderWidth: 1, 
        borderColor: '#e2e8f0', 
        borderStyle: 'dashed' 
    },
    emptyText: { 
        color: '#94a3b8', 
        fontStyle: 'italic' 
    },

    modalOverlay: { 
        flex: 1, 
        backgroundColor: 'rgba(0,0,0,0.5)', 
        justifyContent: 'center', 
        padding: 20 
    },
    modalContent: { 
        backgroundColor: '#fff', 
        padding: 20, 
        borderRadius: 20,
        maxHeight: '80%'
    },
    modalContentCentered: {
        justifyContent: 'center'
    },
    modalTitle: { 
        fontSize: 20, 
        fontWeight: 'bold', 
        color: '#1e293b', 
        marginBottom: 10 
    },
    modalSubtitle: { 
        color: '#64748b', 
        marginBottom: 15 
    },
    attendanceCodeBox: { 
        backgroundColor: '#f1f5f9', 
        padding: 20, 
        borderRadius: 12, 
        borderWidth: 2, 
        borderColor: '#4361ee', 
        borderStyle: 'dashed', 
        marginBottom: 15, 
        width: '100%', 
        alignItems: 'center' 
    },
    attendanceCodeText: { 
        fontSize: 36, 
        fontWeight: 'bold', 
        color: '#4361ee', 
        letterSpacing: 8 
    },
    modalInstruction: { 
        color: '#64748b', 
        marginBottom: 20 
    },
    input: { 
        backgroundColor: '#f8fafc', 
        borderWidth: 1, 
        borderColor: '#e2e8f0', 
        borderRadius: 10, 
        padding: 12, 
        marginBottom: 12, 
        color: '#1e293b' 
    },
    modalButtons: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        marginTop: 10, 
        gap: 10 
    },
    cancelBtn: { 
        paddingVertical: 12, 
        borderRadius: 10, 
        backgroundColor: '#f1f5f9', 
        flex: 1, 
        alignItems: 'center' 
    },
    cancelText: { 
        color: '#64748b', 
        fontWeight: 'bold' 
    },
    submitBtn: { 
        paddingVertical: 12, 
        borderRadius: 10, 
        backgroundColor: '#4361ee', 
        flex: 1, 
        alignItems: 'center' 
    },
    disabledBtn: {
        backgroundColor: '#94a3b8'
    },
    submitText: { 
        color: '#fff', 
        fontWeight: 'bold' 
    },

    passwordRequirement: {
        color: '#64748b',
        fontSize: 12,
        marginBottom: 15,
        fontStyle: 'italic'
    },

    selectCourseContainer: {
        marginBottom: 15,
        borderWidth: 2,
        borderColor: '#4a90e2',
        borderRadius: 10,
        padding: 10
    },
    selectCourseLabel: {
        color: '#4a90e2',
        fontWeight: 'bold',
        marginBottom: 8
    },
    pickerButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#4a90e2',
        borderRadius: 8
    },
    pickerTextPlaceholder: {
        color: '#94a3b8',
        flex: 1
    },
    pickerTextSelected: {
        color: '#1e293b',
        fontWeight: '500',
        flex: 1
    },

    coursePickerItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0'
    },
    coursePickerCode: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#4361ee'
    },
    coursePickerName: {
        fontSize: 16,
        color: '#1e293b',
        marginTop: 2
    },
    coursePickerDetails: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2
    },

    underDevelopment: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderStyle: 'dashed'
    },
    devTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1e293b',
        marginTop: 15,
        textAlign: 'center'
    },
    devText: {
        color: '#64748b',
        marginTop: 5,
        textAlign: 'center'
    },

    digitalIdModal: {
        maxHeight: '90%',
        padding: 15
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15
    },
    closeButton: {
        padding: 5
    },
    idCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        padding: 15,
        borderRadius: 12,
        marginBottom: 15
    },
    idSchool: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    idSchoolName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1e293b'
    },
    idCardType: {
        fontSize: 12,
        color: '#64748b'
    },
    idCardBody: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 15,
        gap: 15
    },
    idPhotoSection: {
        width: 80,
        height: 80,
        borderRadius: 40,
        overflow: 'hidden'
    },
    idPhoto: {
        width: '100%',
        height: '100%'
    },
    idPhotoPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#4361ee',
        justifyContent: 'center',
        alignItems: 'center'
    },
    idPhotoPlaceholderText: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold'
    },
    idInfoSection: {
        flex: 1,
        gap: 8
    },
    idField: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    idFieldLabel: {
        fontSize: 11,
        color: '#64748b'
    },
    idFieldValue: {
        fontSize: 12,
        fontWeight: '600',
        color: '#1e293b'
    },
    idCardFooter: {
        flexDirection: 'row',
        backgroundColor: '#f8fafc',
        padding: 15,
        borderRadius: 12,
        gap: 15
    },
    idQRLarge: {
        width: 80,
        height: 80,
        backgroundColor: '#fff',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e2e8f0'
    },
    idValidity: {
        flex: 1,
        justifyContent: 'center'
    },
    idValidityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#22c55e20',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: 'flex-start',
        gap: 4,
        marginBottom: 5
    },
    idValidityText: {
        color: '#22c55e',
        fontSize: 11,
        fontWeight: 'bold'
    },
    idScanText: {
        fontSize: 11,
        color: '#64748b',
        marginBottom: 2
    },
    idIssueDate: {
        fontSize: 10,
        color: '#94a3b8'
    },
    closeIdButton: {
        backgroundColor: '#4361ee',
        padding: 12,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 15
    },
    closeIdButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16
    }
});