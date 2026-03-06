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
    PROF_IMAGE: 'yallaclass_prof_image'
};

export default function ProfessorDashboard() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    
    const [profileImage, setProfileImage] = useState(null);
    const [profData, setProfData] = useState({ name: 'Loading...', code: '...' });

    const [courses, setCourses] = useState([
        { id: 'CS401', name: 'Data Structures', schedule: 'Mon, Wed 10:00 AM', room: 'Room 201', students: 45, avgAttendance: 95, todayPresent: 40, todayLate: 3, todayAbsent: 2 },
        { id: 'CS301', name: 'Operating Systems', schedule: 'Tue, Thu 2:00 PM', room: 'Room 305', students: 38, avgAttendance: 88, todayPresent: 32, todayLate: 4, todayAbsent: 2 },
        { id: 'CS501', name: 'Machine Learning', schedule: 'Wed, Fri 11:00 AM', room: 'Room 102', students: 32, avgAttendance: 92, todayPresent: 28, todayLate: 2, todayAbsent: 2 }
    ]);

    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState('');
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [newCourse, setNewCourse] = useState({ id: '', name: '', schedule: '', room: '', students: '' });

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
        Alert.alert("تسجيل الخروج", "Are you sure you want to logout?", [
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
            await AsyncStorage.setItem(STORAGE_KEYS.PROF_IMAGE, uri);
            showNotification('Profile photo updated!');
        }
    };

    const removeProfileImage = async () => {
        setProfileImage(null);
        await AsyncStorage.removeItem(STORAGE_KEYS.PROF_IMAGE);
        showNotification('Photo removed');
    };

    const filteredCourses = courses.filter(course =>
        course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const openAddModal = () => {
        setModalType('add');
        setNewCourse({ id: '', name: '', schedule: '', room: '', students: '' });
        setShowModal(true);
    };

    const openEditModal = (course) => {
        setModalType('edit');
        setSelectedCourse(course);
        setNewCourse(course);
        setShowModal(true);
    };

    const openAttendanceModal = (course) => {
        setModalType('attendance');
        setSelectedCourse(course);
        setShowModal(true);
    };

    const deleteCourse = (id) => {
        Alert.alert('Delete Course', 'Are you sure you want to delete this course?', [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Delete', 
                style: 'destructive', 
                onPress: () => {
                    setCourses(courses.filter(c => c.id !== id));
                    showNotification(`Course ${id} deleted`);
                } 
            }
        ]);
    };

    const saveCourse = () => {
        if (!newCourse.id || !newCourse.name) {
            showNotification('Please fill all required fields', 'error');
            return;
        }
        if (modalType === 'add') {
            setCourses([...courses, { ...newCourse, students: Number(newCourse.students) || 0, avgAttendance: 0, todayPresent: 0, todayLate: 0, todayAbsent: 0 }]);
            showNotification(`Course ${newCourse.id} added`);
        } else {
            setCourses(courses.map(c => c.id === selectedCourse.id ? { ...c, ...newCourse } : c));
            showNotification(`Course ${newCourse.id} updated`);
        }
        setShowModal(false);
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

    const duplicateCourse = (course) => {
        const newId = course.id + ' Copy';
        setCourses([...courses, { ...course, id: newId, name: course.name + ' (Copy)' }]);
        showNotification(`Course duplicated as ${newId}`);
    };

    const totalStudents = courses.reduce((sum, c) => sum + c.students, 0);
    const avgAttendance = Math.round(courses.reduce((sum, c) => sum + c.avgAttendance, 0) / (courses.length || 1));
    const totalPresent = courses.reduce((sum, c) => sum + c.todayPresent, 0);

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
                    <Text style={styles.userIdText}>Code: {profData.code}</Text>
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
                            <View style={styles.addPhotoBadge}><Text style={styles.addPhotoText}>+</Text></View>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topNav} contentContainerStyle={styles.topNavContent}>
                <TouchableOpacity style={styles.navItemActive}><Text style={styles.navTextActive}>Dashboard</Text></TouchableOpacity>
                <TouchableOpacity style={styles.navItem}><Text style={styles.navText}>My Courses</Text></TouchableOpacity>
                <TouchableOpacity style={styles.navItem}><Text style={styles.navText}>Schedule</Text></TouchableOpacity>
                <TouchableOpacity style={styles.navItemLogout} onPress={handleLogout}><Text style={styles.navTextLogout}>Logout</Text></TouchableOpacity>
            </ScrollView>

            <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false}>
                
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search courses..."
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                />

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

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>My Courses ({filteredCourses.length})</Text>
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
                                <TouchableOpacity style={styles.btnEdit} onPress={() => openEditModal(course)}>
                                    <Text style={styles.btnTextBlue}>Edit</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.btnEdit} onPress={() => duplicateCourse(course)}>
                                    <Text style={styles.btnTextBlue}>Copy</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.btnDelete} onPress={() => deleteCourse(course.id)}>
                                    <Text style={styles.btnTextRed}>Del</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))
                )}
                <View style={{ height: 50 }} />
            </ScrollView>

            <Modal visible={showModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {modalType === 'attendance' ? (
                            <View style={{ alignItems: 'center' }}>
                                <Text style={styles.modalTitle}>Start Attendance</Text>
                                <Text style={styles.modalSubtitle}>{selectedCourse?.name}</Text>
                                <View style={styles.attendanceCodeBox}><Text style={styles.attendanceCodeText}>2478</Text></View>
                                <Text style={styles.modalInstruction}>Share this code with students</Text>
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}><Text style={styles.cancelText}>Close</Text></TouchableOpacity>
                                    <TouchableOpacity style={styles.submitBtn} onPress={() => { showNotification('Session started!'); setShowModal(false); }}><Text style={styles.submitText}>Start</Text></TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <Text style={styles.modalTitle}>{modalType === 'add' ? 'Add Course' : 'Edit Course'}</Text>
                                <TextInput style={styles.input} placeholder="Course ID" value={newCourse.id} onChangeText={t => setNewCourse({...newCourse, id: t})} />
                                <TextInput style={styles.input} placeholder="Course Name" value={newCourse.name} onChangeText={t => setNewCourse({...newCourse, name: t})} />
                                <TextInput style={styles.input} placeholder="Schedule" value={newCourse.schedule} onChangeText={t => setNewCourse({...newCourse, schedule: t})} />
                                <TextInput style={styles.input} placeholder="Room" value={newCourse.room} onChangeText={t => setNewCourse({...newCourse, room: t})} />
                                <TextInput style={styles.input} placeholder="Students" value={String(newCourse.students)} onChangeText={t => setNewCourse({...newCourse, students: t})} keyboardType="numeric" />
                                
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                                    <TouchableOpacity style={styles.submitBtn} onPress={saveCourse}><Text style={styles.submitText}>Save</Text></TouchableOpacity>
                                </View>
                            </ScrollView>
                        )}
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
    toastSuccess: { backgroundColor: '#4361ee' },
    toastError: { backgroundColor: '#ef4444' },
    toastText: { color: 'white', fontWeight: 'bold', textAlign: 'center' },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#f8fafc' },
    welcomeText: { fontSize: 16, color: '#64748b' },
    userName: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
    userIdText: { fontSize: 14, color: '#4361ee', fontWeight: '600', marginTop: 2 },
    removeText: { color: '#ef4444', fontSize: 12, marginTop: 5, fontWeight: 'bold' },
    userAvatar: { backgroundColor: '#4361ee', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', position: 'relative' },
    userAvatarImage: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: '#4361ee' },
    avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
    addPhotoBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#4caf50', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
    addPhotoText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

    topNav: { backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#e2e8f0', minHeight: 65, maxHeight: 65 },
    topNavContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingRight: 30 },
    navItem: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', marginRight: 10 },
    navItemActive: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#4361ee', marginRight: 10 },
    navItemLogout: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fee2e2', marginRight: 10 },
    navText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
    navTextActive: { color: '#fff', fontWeight: '600', fontSize: 13 },
    navTextLogout: { color: '#ef4444', fontWeight: '600', fontSize: 13 },

    mainContent: { padding: 15 },
    searchInput: { backgroundColor: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 15 },

    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 15 },
    statCard: { width: '48%', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' },
    statLabel: { color: '#64748b', fontSize: 12, marginBottom: 5 },
    statValue: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },

    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
    addBtnPrimary: { backgroundColor: '#4361ee', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
    addBtnPrimaryText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

    courseCard: { backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' },
    courseHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    courseCode: { color: '#4361ee', fontWeight: 'bold' },
    courseSchedule: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, fontSize: 11, color: '#64748b' },
    courseName: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 5 },
    courseMeta: { color: '#64748b', fontSize: 13 },
    
    attendanceBadge: { backgroundColor: '#f1f5f9', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15, marginTop: 10 },
    attendanceBadgeText: { color: '#4361ee', fontWeight: 'bold', fontSize: 12 },

    attendanceButtons: { flexDirection: 'row', gap: 8, marginTop: 15 },
    btnPresent: { backgroundColor: '#22c55e', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
    btnLate: { backgroundColor: '#eab308', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
    btnAbsent: { backgroundColor: '#ef4444', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
    btnTextSmall: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

    todayStats: { flexDirection: 'row', gap: 15, backgroundColor: '#f8fafc', padding: 10, borderRadius: 8, marginTop: 10 },
    statP: { color: '#22c55e', fontWeight: 'bold', fontSize: 12 },
    statL: { color: '#eab308', fontWeight: 'bold', fontSize: 12 },
    statA: { color: '#ef4444', fontWeight: 'bold', fontSize: 12 },

    actionButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, borderTopWidth: 1, borderColor: '#f1f5f9', paddingTop: 15 },
    btnStart: { backgroundColor: '#4361ee', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, flex: 1, marginRight: 5, alignItems: 'center' },
    btnEdit: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#4361ee', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, flex: 1, marginHorizontal: 5, alignItems: 'center' },
    btnDelete: { backgroundColor: '#fee2e2', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, flex: 1, marginLeft: 5, alignItems: 'center' },
    btnTextWhite: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
    btnTextBlue: { color: '#4361ee', fontWeight: 'bold', fontSize: 12 },
    btnTextRed: { color: '#ef4444', fontWeight: 'bold', fontSize: 12 },

    emptyState: { padding: 30, alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
    emptyText: { color: '#94a3b8', fontStyle: 'italic' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b', marginBottom: 10 },
    modalSubtitle: { color: '#64748b', marginBottom: 15 },
    attendanceCodeBox: { backgroundColor: '#f1f5f9', padding: 20, borderRadius: 12, borderWidth: 2, borderColor: '#4361ee', borderStyle: 'dashed', marginBottom: 15, width: '100%', alignItems: 'center' },
    attendanceCodeText: { fontSize: 36, fontWeight: 'bold', color: '#4361ee', letterSpacing: 8 },
    modalInstruction: { color: '#64748b', marginBottom: 20 },
    input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, marginBottom: 12, color: '#1e293b' },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 10 },
    cancelBtn: { paddingVertical: 12, borderRadius: 10, backgroundColor: '#f1f5f9', flex: 1, alignItems: 'center' },
    cancelText: { color: '#64748b', fontWeight: 'bold' },
    submitBtn: { paddingVertical: 12, borderRadius: 10, backgroundColor: '#4361ee', flex: 1, alignItems: 'center' },
    submitText: { color: '#fff', fontWeight: 'bold' }
});