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
import * as Location from 'expo-location';
import { auth, db } from './firebase'; 
import { doc, getDoc, collection, query, where, getDocs, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

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
    const [sidebarOpen, setSidebarOpen] = useState(true);
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
    const [courseRiskScores, setCourseRiskScores] = useState({});
    const [profileImage, setProfileImage] = useState(null);
    const [modal, setModal] = useState({ show: false, type: null });
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [isViewCourseModalOpen, setIsViewCourseModalOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
    const [isRiskDetailsModalOpen, setIsRiskDetailsModalOpen] = useState(false);
    const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
    const [selectedRiskCourse, setSelectedRiskCourse] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [isCheckingIn, setIsCheckingIn] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [courseForm, setCourseForm] = useState({ id: '', name: '', instructor: '', schedule: '', room: '', students: '' });
    const [passwordFields, setPasswordFields] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [editProfileData, setEditProfileData] = useState({
        phoneNumber: '',
        address: '',
        emergencyContact: ''
    });
    const CLASSROOM_LAT = 29.835141; 
    const CLASSROOM_LON = 31.360812; 
    const ALLOWED_RADIUS = 50;

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
                            console.log("Student is at risk, notifying server...");
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
        if (!isLoading) {
            saveDataToStorage();
        }
    }, [courses, upcoming, attendance, trend, isLoading]);

    useEffect(() => {
        const timer = setInterval(() => {
            setCourses(prev => prev.map(c => {
                if (c.timeRemaining > 0) {
                    return { ...c, timeRemaining: c.timeRemaining - 1 };
                } else if (c.timeRemaining === 0 && c.checkedIn) {
                    return { ...c, checkedIn: false };
                }
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
        } catch (error) {
            console.error("Error saving data", error);
        }
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
                        attendanceRate: 0,
                        checkedIn: false,
                        timeRemaining: 0,
                        grades: 0,
                        timeliness: 0,
                        riskScore: 0,
                        riskLevel: getRiskLevel(0)
                    });
                });
            }
            
            setCourses(enrolledCourses);
            setStudentData(prev => ({
                ...prev,
                enrolledCourses: enrolledCourses.length
            }));
            
            const upcomingClasses = enrolledCourses.map((c, index) => ({
                id: index + 1,
                name: c.name,
                time: c.time,
                room: c.room,
                date: index === 0 ? "Today" : index === 1 ? "Today" : "Tomorrow",
                courseId: c.id
            }));
            setUpcoming(upcomingClasses);
            const attendanceRecords = enrolledCourses.map(c => ({
                class: c.id,
                name: c.name,
                onTime: 0,
                late: 0,
                absences: 0,
                total: 0
            }));
            setAttendance(attendanceRecords);
            
        } catch (error) {
            console.error("Error loading courses:", error);
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
                    id: courseData.courseId,
                    name: courseData.courseName,
                    instructor: courseData.instructorName,
                    schedule: `${courseData.SelectDays || 'TBA'} ${courseData.Time || ''}`,
                    days: courseData.SelectDays ? courseData.SelectDays.split(', ') : [],
                    time: courseData.Time || 'TBA',
                    room: courseData.RoomNumber || 'TBA',
                    capacity: parseInt(courseData.capacity) || 0,
                    enrolled: courseData.enrolledStudents || 0
                });
            });
            setAvailableCourses(coursesList);
        } catch (error) {
            console.error("Error loading available courses:", error);
        }
    };

    const handleAddCourse = async (course) => {
        try {
            const user = auth.currentUser;
            if (!user) return;
            
            if (courses.length >= 5) {
                showNotification('You can only enroll in up to 5 courses', 'error');
                return;
            }
            
            if (courses.some(c => c.id === course.id)) {
                showNotification('You are already enrolled in this course', 'error');
                return;
            }

            setLoading(true);
            const userDocRef = doc(db, "users", user.uid);
            
            await updateDoc(userDocRef, {
                enrolledCourses: arrayUnion(course.id)
            });
            
            const newCourse = {
                ...course,
                students: course.capacity,
                attendanceRate: 0,
                checkedIn: false,
                timeRemaining: 0,
                grades: 0,
                timeliness: 0,
                riskScore: 0,
                riskLevel: getRiskLevel(0)
            };

            setCourses(prev => [...prev, newCourse]);
            setStudentData(prev => ({
                ...prev,
                enrolledCourses: prev.enrolledCourses + 1
            }));

            showNotification(`Successfully enrolled in ${course.name}`, 'success');
            setIsAddCourseModalOpen(false);
            setModal({ show: false, type: null });

        } catch (error) {
            console.error("Error adding course:", error);
            showNotification('Error enrolling in course', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCourse = async (courseId) => {
        Alert.alert('Drop Course', 'Are you sure you want to drop this course?', [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Drop', 
                style: 'destructive',
                onPress: async () => {
                    try {
                        const user = auth.currentUser;
                        if (!user) return;

                        setLoading(true);
                        const userDocRef = doc(db, "users", user.uid);
                    
                        await updateDoc(userDocRef, {
                            enrolledCourses: arrayRemove(courseId)
                        });
                        
                        setCourses(prev => prev.filter(c => c.id !== courseId));
                        setUpcoming(prev => prev.filter(u => u.courseId !== courseId));
                        setStudentData(prev => ({
                            ...prev,
                            enrolledCourses: prev.enrolledCourses - 1
                        }));

                        if (selectedCourse === courseId) setSelectedCourse(null);
                        showNotification('Course dropped successfully', 'success');

                    } catch (error) {
                        console.error("Error deleting course:", error);
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
        if (permissionResult.granted === false) {
            Alert.alert("Permission Required", "Please allow access to your photo library");
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

    const handleCheckIn = async (courseId, courseName) => {
        if (!studentData.gpsActive) {
            Alert.alert("GPS Required", "Please enable GPS to check in!");
            return;
        }

        const activeCheckedInCourse = courses.find(
            c => c.checkedIn && c.timeRemaining > 0 && c.id !== courseId
        );

        if (activeCheckedInCourse) {
            Alert.alert(
                "Active Session", 
                `You are already checked in to ${activeCheckedInCourse.name}. Please wait for it to expire.`
            );
            return;
        }

        try {
            setIsCheckingIn(true);
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission Denied", "Location permission is required to check in.");
                setIsCheckingIn(false);
                return;
            }
            
            let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const studentLat = location.coords.latitude;
            const studentLon = location.coords.longitude;
            
            const distance = getDistanceFromLatLonInMeters(studentLat, studentLon, CLASSROOM_LAT, CLASSROOM_LON);

            if (distance <= ALLOWED_RADIUS) {
                const user = auth.currentUser;
                if (user) {
                    await addDoc(collection(db, "attendance"), {
                        studentId: user.uid,
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
                        const newRiskLevel = getRiskLevel(newRiskScore);
                        
                        return { 
                            ...c, 
                            checkedIn: true, 
                            attendanceRate: newAttendanceRate,
                            riskScore: newRiskScore,
                            riskLevel: newRiskLevel
                        };
                    }
                    return c;
                }));
                
                setStudentData(prev => ({ 
                    ...prev, 
                    overallAttendance: Math.min(100, prev.overallAttendance + 0.5) 
                }));
                
                // Update attendance records
                setAttendance(prev => prev.map(a => {
                    if (a.class === courseId) {
                        return { ...a, onTime: a.onTime + 1, total: a.total + 1 };
                    }
                    return a;
                }));
                
                showNotification('Checked in successfully!');
                updateOverallRiskScore();

            } else {
                Alert.alert("Check-in Failed", `You are ${Math.round(distance)} meters away from the classroom. Please move closer.`);
            }

        } catch (error) {
            console.error("Check-in Error:", error);
            Alert.alert("Error", "Failed to check in. Please try again.");
        } finally {
            setIsCheckingIn(false);
        }
    };

    const updateOverallRiskScore = () => {
        const totalScore = courses.reduce((sum, c) => sum + (c.riskScore || 0), 0);
        const averageScore = courses.length > 0 ? Math.round(totalScore / courses.length) : 0;
        const newRisk = getRiskLevel(averageScore);
        
        if (auth.currentUser) {
            updateRiskOnServer(auth.currentUser.uid, newRisk.level);
        }
    };

    const updateRiskOnServer = async (uid, riskLevel) => {
        try {
            const token = await AsyncStorage.getItem('token');
            
            const response = await fetch('http://localhost:3001/api/attendance/update-risk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    uid: uid,
                    riskLevel: riskLevel
                })
            });

            const data = await response.json();
            
            if (data.success) {
                console.log("Server updated: ", data.message);
                if (riskLevel === "High Risk") {
                    showNotification("Alert: High risk level detected!", "error");
                } else if (riskLevel === "Medium Risk") {
                    showNotification("Warning: Your risk level is now Medium.", "warning");
                }
            }
        } catch (error) {
            console.error("Error connecting to backend:", error);
        }
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

    const toggleGPS = () => {
        setStudentData(prev => ({ ...prev, gpsActive: !prev.gpsActive }));
        showNotification(`GPS ${!studentData.gpsActive ? 'Activated' : 'Deactivated'}`);
    };
    const handleLogout = () => {
        Alert.alert("Logout", "Are you sure you want to logout?", [
            { text: "Cancel", style: "cancel" },
            { 
                text: "Logout", 
                style: "destructive", 
                onPress: async () => {
                    await AsyncStorage.removeItem('token');
                    await AsyncStorage.removeItem(STORAGE_KEYS.PROFILE_IMAGE);
                    router.replace('/');
                } 
            }
        ]);
    };
    const showNotification = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };

    const viewCourseDetails = (course) => {
        setSelectedCourse(course);
        setIsViewCourseModalOpen(true);
    };

    const viewRiskDetails = (course) => {
        setSelectedRiskCourse(course);
        setIsRiskDetailsModalOpen(true);
    };

    const overallRiskScore = courses.length > 0 
        ? Math.round(courses.reduce((sum, c) => sum + (c.riskScore || 0), 0) / courses.length)
        : 0;
    const overallRiskLevel = getRiskLevel(overallRiskScore);

    const filteredCourses = courses.filter(c => 
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        c.id?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredAvailableCourses = availableCourses.filter(c => 
        !courses.some(enrolled => enrolled.id === c.id) &&
        (c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
         c.id?.toLowerCase().includes(searchQuery.toLowerCase()))
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
                <View style={[styles.toast, toast.type === 'error' ? styles.toastError : toast.type === 'warning' ? styles.toastWarning : styles.toastSuccess]}>
                    <Text style={styles.toastText}>{toast.message}</Text>
                </View>
            ) : null}
            <View style={styles.header}>
                <View>
                    <Text style={styles.welcomeText}>Welcome back,</Text>
                    <Text style={styles.userName}>{studentData.name}</Text>
                    <Text style={styles.userIdText}>ID: {studentData.id}</Text>
                    <Text style={styles.userEmailText}>{studentData.email}</Text>
                    {profileImage && (
                        <TouchableOpacity onPress={removeProfileImage}>
                            <Text style={styles.removeText}>Remove Photo</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity onPress={handleImageUpload}>
                    {profileImage || studentData.profileImage ? (
                        <Image source={{ uri: profileImage || studentData.profileImage }} style={styles.userAvatarImage} />
                    ) : (
                        <View style={styles.userAvatar}>
                            <Text style={styles.avatarText}>
                                {studentData.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
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
                    style={[styles.navItem, activeTab === 'Attendance' && styles.navItemActive]} 
                    onPress={() => setActiveTab('Attendance')}
                >
                    <Text style={[styles.navText, activeTab === 'Attendance' && styles.navTextActive]}>Attendance</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.navItem, activeTab === 'Schedule' && styles.navItemActive]} 
                    onPress={() => setActiveTab('Schedule')}
                >
                    <Text style={[styles.navText, activeTab === 'Schedule' && styles.navTextActive]}>Schedule</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.navItem, activeTab === 'Profile' && styles.navItemActive]} 
                    onPress={() => setActiveTab('Profile')}
                >
                    <Text style={[styles.navText, activeTab === 'Profile' && styles.navTextActive]}>Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={styles.navItemPassword} 
                    onPress={() => setIsPasswordModalOpen(true)}
                >
                    <Text style={styles.navTextPassword}>Change Password</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItemLogout} onPress={handleLogout}>
                    <Text style={styles.navTextLogout}>Logout</Text>
                </TouchableOpacity>
            </ScrollView>
            <View style={styles.searchContainer}>
                <Feather name="search" size={18} color="#64748b" style={styles.searchIcon} />
                <TextInput 
                    style={styles.searchInput}
                    placeholder="Search courses..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholderTextColor="#94a3b8"
                />
            </View>

            <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false}>
                {activeTab === 'Dashboard' && (
                    <View>
                        <View style={styles.statsGrid}>
                            <View style={styles.statCard} onTouchEnd={() => showNotification(`Overall Attendance: ${studentData.overallAttendance}%`)}>
                                <Text style={styles.statLabel}>Attendance</Text>
                                <Text style={styles.statValue}>{studentData.overallAttendance}%</Text>
                            </View>
                            <View style={styles.statCard} onTouchEnd={() => setActiveTab('My Courses')}>
                                <Text style={styles.statLabel}>Courses</Text>
                                <Text style={styles.statValue}>{courses.length}/5</Text>
                            </View>
                            <View style={styles.statCard} onTouchEnd={() => setIsAttendanceModalOpen(true)}>
                                <Text style={styles.statLabel}>This Week</Text>
                                <Text style={styles.statValue}>{attendance.filter(a => a.onTime > 0).length}</Text>
                            </View>
                            <TouchableOpacity 
                                style={[styles.statCard, { borderLeftWidth: 4, borderLeftColor: overallRiskLevel.color }]} 
                                onPress={() => showNotification(`Overall Risk Score: ${overallRiskScore} - ${overallRiskLevel.level}`)}
                            >
                                <Text style={styles.statLabel}>Risk Score</Text>
                                <Text style={[styles.statValue, { color: overallRiskLevel.color }]}>{overallRiskScore}</Text>
                                <Text style={[styles.statSmallLabel, { color: overallRiskLevel.color }]}>{overallRiskLevel.level}</Text>
                            </TouchableOpacity>
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
                                                disabled={course?.checkedIn || isCheckingIn}
                                            >
                                                <Text style={styles.checkInMiniText}>
                                                    {course?.checkedIn ? '✓' : isCheckingIn ? '...' : 'Check In'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })
                            )}
                        </View>
                        <View style={styles.sectionCard}>
                            <View style={styles.sectionHeader}>
                                <Feather name="bell" size={20} color="#4361ee" />
                                <Text style={styles.sectionTitle}>Recent Activity</Text>
                            </View>
                            {courses.filter(c => c.checkedIn).slice(0, 3).length === 0 ? (
                                <Text style={styles.noDataText}>No recent activity</Text>
                            ) : (
                                courses.filter(c => c.checkedIn).slice(0, 3).map((course, i) => (
                                    <View style={styles.activityItem} key={i}>
                                        <View style={styles.activityIconSuccess}>
                                            <Feather name="check-circle" size={16} color="#22c55e" />
                                        </View>
                                        <View style={styles.activityText}>
                                            <Text style={styles.activityTitle}>Checked in to {course.name}</Text>
                                            <Text style={styles.activityTime}>Today at {course.time}</Text>
                                        </View>
                                    </View>
                                ))
                            )}
                        </View>
                        <View style={styles.sectionCard}>
                            <View style={styles.sectionHeader}>
                                <Feather name="book-open" size={20} color="#4361ee" />
                                <Text style={styles.sectionTitle}>My Courses</Text>
                                <TouchableOpacity onPress={() => setActiveTab('My Courses')}>
                                    <Text style={styles.viewAllLink}>View All</Text>
                                </TouchableOpacity>
                            </View>
                            {courses.slice(0, 3).map(course => (
                                <TouchableOpacity style={styles.courseMiniCard} key={course.id} onPress={() => viewCourseDetails(course)}>
                                    <View style={styles.courseMiniHeader}>
                                        <Text style={styles.courseMiniCode}>{course.id}</Text>
                                        <View style={[styles.statusBadge, course.checkedIn ? styles.statusChecked : styles.statusPending]}>
                                            <Text style={styles.statusBadgeText}>{course.checkedIn ? 'Checked' : 'Pending'}</Text>
                                        </View>
                                    </View>
                                    <Text style={styles.courseMiniName}>{course.name}</Text>
                                    <Text style={styles.courseMiniInstructor}>{course.instructor}</Text>
                                    <View style={styles.courseMiniFooter}>
                                        <Text style={styles.courseMiniSchedule}>{course.schedule}</Text>
                                        <Text style={styles.courseMiniAttendance}>{course.attendanceRate}%</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={styles.sectionCard}>
                            <View style={styles.sectionHeader}>
                                <Feather name="trending-up" size={20} color="#4361ee" />
                                <Text style={styles.sectionTitle}>Attendance Trend</Text>
                                <TouchableOpacity onPress={() => setIsAttendanceModalOpen(true)}>
                                    <Text style={styles.viewAllLink}>View Details</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.trendContainer}>
                                <View style={styles.chartBars}>
                                    {trend.slice(-4).map((week, index) => (
                                        <View key={index} style={styles.barWrapper}>
                                            <View style={[styles.bar, { height: week.rate }]} />
                                            <Text style={styles.barLabel}>{week.rate}%</Text>
                                        </View>
                                    ))}
                                </View>
                                <View style={styles.axisLabels}>
                                    {trend.slice(-4).map((week, idx) => (
                                        <Text key={idx} style={styles.axisLabel}>{week.week}</Text>
                                    ))}
                                </View>
                            </View>
                        </View>
                        <TouchableOpacity 
                            style={[styles.gpsCard, studentData.gpsActive ? styles.gpsActive : styles.gpsInactive]} 
                            onPress={toggleGPS}
                        >
                            <Feather name="map-pin" size={24} color={studentData.gpsActive ? "#fff" : "#64748b"} />
                            <Text style={[styles.gpsText, { color: studentData.gpsActive ? "#fff" : "#64748b" }]}>
                                GPS {studentData.gpsActive ? 'ON' : 'OFF'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
                {activeTab === 'My Courses' && (
                    <View style={styles.fullPageCard}>
                        <View style={styles.cardHeader}>
                            <View style={styles.headerTitle}>
                                <Feather name="book-open" size={24} color="#4361ee" />
                                <Text style={styles.headerTitleText}>My Courses ({courses.length}/5)</Text>
                            </View>
                            {courses.length < 5 && (
                                <TouchableOpacity 
                                    style={styles.addButton}
                                    onPress={() => setIsAddCourseModalOpen(true)}
                                >
                                    <Feather name="plus" size={18} color="#fff" />
                                    <Text style={styles.addButtonText}>Add Course</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {courses.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Feather name="book-open" size={48} color="#cbd5e1" />
                                <Text style={styles.emptyStateText}>You haven't enrolled in any courses yet</Text>
                                {courses.length < 5 && (
                                    <TouchableOpacity 
                                        style={styles.emptyStateButton}
                                        onPress={() => setIsAddCourseModalOpen(true)}
                                    >
                                        <Feather name="plus" size={20} color="#fff" />
                                        <Text style={styles.emptyStateButtonText}>Enroll in a Course</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ) : (
                            filteredCourses.map(course => (
                                <View style={styles.courseCard} key={course.id}>
                                    <View style={styles.courseCardHeader}>
                                        <Text style={styles.courseCardCode}>{course.id}</Text>
                                        <TouchableOpacity onPress={() => handleDeleteCourse(course.id)}>
                                            <Feather name="trash-2" size={16} color="#ef4444" />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={styles.courseCardName}>{course.name}</Text>
                                    <Text style={styles.courseCardInstructor}>{course.instructor}</Text>
                                    
                                    <View style={styles.courseDetails}>
                                        <View style={styles.detailRow}>
                                            <Feather name="calendar" size={14} color="#64748b" />
                                            <Text style={styles.detailText}>{course.schedule}</Text>
                                        </View>
                                        <View style={styles.detailRow}>
                                            <Feather name="map-pin" size={14} color="#64748b" />
                                            <Text style={styles.detailText}>Room {course.room}</Text>
                                        </View>
                                    </View>
                                    
                                    <View style={styles.courseCardFooter}>
                                        <View style={styles.attendanceProgress}>
                                            <View style={styles.progressBar}>
                                                <View style={[styles.progressFill, { width: `${course.attendanceRate}%` }]} />
                                            </View>
                                            <Text style={styles.attendancePercent}>{course.attendanceRate}%</Text>
                                        </View>
                                        <TouchableOpacity 
                                            style={[styles.checkInButton, course.checkedIn && styles.checkInButtonDisabled]}
                                            onPress={() => handleCheckIn(course.id, course.name)}
                                            disabled={course.checkedIn || isCheckingIn}
                                        >
                                            {isCheckingIn ? (
                                                <ActivityIndicator color="#fff" size="small" />
                                            ) : (
                                                <Text style={styles.checkInButtonText}>
                                                    {course.checkedIn ? 'Checked In' : 'Check In'}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                    <TouchableOpacity 
                                        style={[styles.riskBadge, { backgroundColor: course.riskLevel?.color + '20' }]}
                                        onPress={() => viewRiskDetails(course)}
                                    >
                                        <Text style={[styles.riskBadgeText, { color: course.riskLevel?.color }]}>
                                            {course.riskLevel?.icon} Risk: {course.riskScore} - {course.riskLevel?.level}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            ))
                        )}
                    </View>
                )}
                {activeTab === 'Attendance' && (
                    <View style={styles.fullPageCard}>
                        <View style={styles.cardHeader}>
                            <View style={styles.headerTitle}>
                                <Feather name="trending-up" size={24} color="#4361ee" />
                                <Text style={styles.headerTitleText}>Attendance Records</Text>
                            </View>
                            <TouchableOpacity style={styles.exportButton} onPress={() => showNotification('Downloading report...')}>
                                <Feather name="download" size={18} color="#4361ee" />
                                <Text style={styles.exportButtonText}>Export</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.attendanceSummary}>
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryLabel}>Overall Attendance</Text>
                                <Text style={styles.summaryValue}>{studentData.overallAttendance}%</Text>
                            </View>
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryLabel}>Enrolled Courses</Text>
                                <Text style={styles.summaryValue}>{courses.length}</Text>
                            </View>
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryLabel}>On Time</Text>
                                <Text style={[styles.summaryValue, { color: '#22c55e' }]}>
                                    {attendance.reduce((sum, a) => sum + a.onTime, 0)}
                                </Text>
                            </View>
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryLabel}>Late</Text>
                                <Text style={[styles.summaryValue, { color: '#f59e0b' }]}>
                                    {attendance.reduce((sum, a) => sum + a.late, 0)}
                                </Text>
                            </View>
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryLabel}>Absences</Text>
                                <Text style={[styles.summaryValue, { color: '#ef4444' }]}>
                                    {attendance.reduce((sum, a) => sum + a.absences, 0)}
                                </Text>
                            </View>
                        </View>

                        {attendance.map((item, idx) => (
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
                    </View>
                )}
                {activeTab === 'Schedule' && (
                    <View style={styles.fullPageCard}>
                        <View style={styles.cardHeader}>
                            <View style={styles.headerTitle}>
                                <Feather name="calendar" size={24} color="#4361ee" />
                                <Text style={styles.headerTitleText}>Weekly Schedule</Text>
                            </View>
                        </View>

                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => {
                            const dayClasses = upcoming.filter(u => {
                                const course = courses.find(c => c.id === u.courseId);
                                return course?.days.includes(day.substring(0, 3));
                            });
                            
                            return (
                                <View style={styles.scheduleDayCard} key={day}>
                                    <Text style={styles.scheduleDayTitle}>{day}</Text>
                                    {dayClasses.length === 0 ? (
                                        <Text style={styles.noClasses}>No classes</Text>
                                    ) : (
                                        dayClasses.map((cls, idx) => (
                                            <View style={styles.dayClass} key={idx}>
                                                <Text style={styles.classTime}>{cls.time}</Text>
                                                <Text style={styles.className}>{cls.name}</Text>
                                                <Text style={styles.classRoom}>Room {cls.room}</Text>
                                            </View>
                                        ))
                                    )}
                                </View>
                            );
                        })}
                    </View>
                )}
                {activeTab === 'Profile' && (
                    <View style={styles.profileView}>
                        <View style={styles.profileCard}>
                            <View style={styles.profileHeader}>
                                <View style={styles.profileAvatarLarge}>
                                    {profileImage || studentData.profileImage ? (
                                        <Image source={{ uri: profileImage || studentData.profileImage }} style={styles.avatarLarge} />
                                    ) : (
                                        <View style={styles.avatarPlaceholder}>
                                            <Text style={styles.avatarPlaceholderText}>
                                                {studentData.name.charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <View style={styles.profileTitle}>
                                    <Text style={styles.profileName}>{studentData.name}</Text>
                                    <Text style={styles.profileEmail}>{studentData.email}</Text>
                                    <Text style={styles.profileId}>Student ID: {studentData.id}</Text>
                                </View>
                                <TouchableOpacity style={styles.editProfileButton} onPress={() => setIsProfileModalOpen(true)}>
                                    <Feather name="edit" size={16} color="#4361ee" />
                                    <Text style={styles.editProfileText}>Edit Profile</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.profileDetails}>
                                <View style={styles.detailSection}>
                                    <Text style={styles.detailSectionTitle}>Academic Information</Text>
                                    <View style={styles.detailGrid}>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Department:</Text>
                                            <Text style={styles.detailValue}>{studentData.department}</Text>
                                        </View>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Academic Year:</Text>
                                            <Text style={styles.detailValue}>{studentData.academicYear}</Text>
                                        </View>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Enrolled Courses:</Text>
                                            <Text style={styles.detailValue}>{courses.length}/5</Text>
                                        </View>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Overall Attendance:</Text>
                                            <Text style={styles.detailValue}>{studentData.overallAttendance}%</Text>
                                        </View>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>GPA:</Text>
                                            <Text style={[styles.detailValue, { color: '#4361ee' }]}>{studentData.gpa}</Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={styles.detailSection}>
                                    <Text style={styles.detailSectionTitle}>Contact Information</Text>
                                    <View style={styles.detailGrid}>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Email:</Text>
                                            <Text style={styles.detailValue}>{studentData.email}</Text>
                                        </View>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Phone:</Text>
                                            <Text style={styles.detailValue}>{editProfileData.phoneNumber || 'Not provided'}</Text>
                                        </View>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Address:</Text>
                                            <Text style={styles.detailValue}>{editProfileData.address || 'Not provided'}</Text>
                                        </View>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Emergency Contact:</Text>
                                            <Text style={styles.detailValue}>{editProfileData.emergencyContact || 'Not provided'}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                <View style={{ height: 50 }} />
            </ScrollView>
            <Modal visible={isAddCourseModalOpen} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, styles.modalLarge]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add New Course</Text>
                            <TouchableOpacity onPress={() => setIsAddCourseModalOpen(false)}>
                                <Feather name="x" size={20} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalSearch}>
                            <Feather name="search" size={18} color="#64748b" style={styles.modalSearchIcon} />
                            <TextInput 
                                style={styles.modalSearchInput}
                                placeholder="Search available courses..."
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholderTextColor="#94a3b8"
                            />
                        </View>

                        <ScrollView style={styles.availableCourses}>
                            {filteredAvailableCourses.length === 0 ? (
                                <Text style={styles.noDataText}>No available courses found</Text>
                            ) : (
                                filteredAvailableCourses.map(course => (
                                    <View style={styles.availableCourseCard} key={course.id}>
                                        <View style={styles.courseCodeBadge}>
                                            <Text style={styles.courseCodeBadgeText}>{course.id}</Text>
                                        </View>
                                        <View style={styles.availableCourseInfo}>
                                            <Text style={styles.availableCourseName}>{course.name}</Text>
                                            <Text style={styles.availableCourseInstructor}>{course.instructor}</Text>
                                            <View style={styles.availableCourseMeta}>
                                                <View style={styles.metaItem}>
                                                    <Feather name="calendar" size={12} color="#64748b" />
                                                    <Text style={styles.metaText}>{course.schedule}</Text>
                                                </View>
                                                <View style={styles.metaItem}>
                                                    <Feather name="map-pin" size={12} color="#64748b" />
                                                    <Text style={styles.metaText}>Room {course.room}</Text>
                                                </View>
                                                <View style={styles.metaItem}>
                                                    <Feather name="users" size={12} color="#64748b" />
                                                    <Text style={styles.metaText}>{course.enrolled}/{course.capacity}</Text>
                                                </View>
                                            </View>
                                        </View>
                                        <TouchableOpacity 
                                            style={styles.addCourseConfirm}
                                            onPress={() => handleAddCourse(course)}
                                            disabled={loading}
                                        >
                                            <Text style={styles.addCourseConfirmText}>
                                                {loading ? 'Adding...' : 'Add'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
            <Modal visible={isPasswordModalOpen} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, styles.modalSmall]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Change Password</Text>
                            <TouchableOpacity onPress={() => setIsPasswordModalOpen(false)}>
                                <Feather name="x" size={20} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalForm}>
                            <View style={styles.formGroup}>
                                <Text style={styles.formLabel}>Current Password</Text>
                                <TextInput 
                                    style={styles.formInput}
                                    secureTextEntry
                                    value={passwordFields.currentPassword}
                                    onChangeText={t => setPasswordFields({...passwordFields, currentPassword: t})}
                                    placeholder="Enter current password"
                                    placeholderTextColor="#94a3b8"
                                />
                            </View>
                            <View style={styles.formGroup}>
                                <Text style={styles.formLabel}>New Password</Text>
                                <TextInput 
                                    style={styles.formInput}
                                    secureTextEntry
                                    value={passwordFields.newPassword}
                                    onChangeText={t => setPasswordFields({...passwordFields, newPassword: t})}
                                    placeholder="Enter new password"
                                    placeholderTextColor="#94a3b8"
                                />
                            </View>
                            <View style={styles.formGroup}>
                                <Text style={styles.formLabel}>Confirm Password</Text>
                                <TextInput 
                                    style={styles.formInput}
                                    secureTextEntry
                                    value={passwordFields.confirmPassword}
                                    onChangeText={t => setPasswordFields({...passwordFields, confirmPassword: t})}
                                    placeholder="Confirm new password"
                                    placeholderTextColor="#94a3b8"
                                />
                            </View>
                            <Text style={styles.passwordHint}>Password must be at least 6 characters long</Text>

                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.cancelButton} onPress={() => setIsPasswordModalOpen(false)}>
                                    <Text style={styles.cancelButtonText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.submitButton} onPress={handlePasswordUpdate}>
                                    <Text style={styles.submitButtonText}>Update</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
            <Modal visible={isProfileModalOpen} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Edit Profile</Text>
                            <TouchableOpacity onPress={() => setIsProfileModalOpen(false)}>
                                <Feather name="x" size={20} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalForm}>
                            <View style={styles.formGroup}>
                                <Text style={styles.formLabel}>Phone Number</Text>
                                <TextInput 
                                    style={styles.formInput}
                                    value={editProfileData.phoneNumber}
                                    onChangeText={t => setEditProfileData({...editProfileData, phoneNumber: t})}
                                    placeholder="Enter phone number"
                                    placeholderTextColor="#94a3b8"
                                />
                            </View>
                            <View style={styles.formGroup}>
                                <Text style={styles.formLabel}>Address</Text>
                                <TextInput 
                                    style={styles.formInput}
                                    value={editProfileData.address}
                                    onChangeText={t => setEditProfileData({...editProfileData, address: t})}
                                    placeholder="Enter address"
                                    placeholderTextColor="#94a3b8"
                                />
                            </View>
                            <View style={styles.formGroup}>
                                <Text style={styles.formLabel}>Emergency Contact</Text>
                                <TextInput 
                                    style={styles.formInput}
                                    value={editProfileData.emergencyContact}
                                    onChangeText={t => setEditProfileData({...editProfileData, emergencyContact: t})}
                                    placeholder="Enter emergency contact"
                                    placeholderTextColor="#94a3b8"
                                />
                            </View>

                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.cancelButton} onPress={() => setIsProfileModalOpen(false)}>
                                    <Text style={styles.cancelButtonText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={styles.submitButton} 
                                    onPress={() => {
                                        showNotification('Profile updated successfully!');
                                        setIsProfileModalOpen(false);
                                    }}
                                >
                                    <Text style={styles.submitButtonText}>Save Changes</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
            <Modal visible={isViewCourseModalOpen} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Course Details</Text>
                            <TouchableOpacity onPress={() => setIsViewCourseModalOpen(false)}>
                                <Feather name="x" size={20} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        {selectedCourse && (
                            <View style={styles.modalBody}>
                                <View style={styles.detailItem}>
                                    <Text style={styles.detailItemLabel}>Course Code:</Text>
                                    <Text style={styles.detailItemValue}>{selectedCourse.id}</Text>
                                </View>
                                <View style={styles.detailItem}>
                                    <Text style={styles.detailItemLabel}>Course Name:</Text>
                                    <Text style={styles.detailItemValue}>{selectedCourse.name}</Text>
                                </View>
                                <View style={styles.detailItem}>
                                    <Text style={styles.detailItemLabel}>Instructor:</Text>
                                    <Text style={styles.detailItemValue}>{selectedCourse.instructor}</Text>
                                </View>
                                <View style={styles.detailItem}>
                                    <Text style={styles.detailItemLabel}>Schedule:</Text>
                                    <Text style={styles.detailItemValue}>{selectedCourse.schedule}</Text>
                                </View>
                                <View style={styles.detailItem}>
                                    <Text style={styles.detailItemLabel}>Room:</Text>
                                    <Text style={styles.detailItemValue}>{selectedCourse.room}</Text>
                                </View>
                                <View style={styles.detailItem}>
                                    <Text style={styles.detailItemLabel}>Attendance Rate:</Text>
                                    <Text style={styles.detailItemValue}>{selectedCourse.attendanceRate}%</Text>
                                </View>
                                <View style={styles.detailItem}>
                                    <Text style={styles.detailItemLabel}>Risk Score:</Text>
                                    <Text style={[styles.detailItemValue, { color: selectedCourse.riskLevel?.color }]}>
                                        {selectedCourse.riskScore} - {selectedCourse.riskLevel?.level}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
            <Modal visible={isRiskDetailsModalOpen} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Risk Assessment Details</Text>
                            <TouchableOpacity onPress={() => setIsRiskDetailsModalOpen(false)}>
                                <Feather name="x" size={20} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        {selectedRiskCourse && (
                            <View style={styles.modalBody}>
                                <Text style={styles.modalSubtitle}>{selectedRiskCourse.name}</Text>
                                <View style={styles.riskDetailItem}>
                                    <Text style={styles.riskDetailLabel}>Attendance Rate:</Text>
                                    <Text style={styles.riskDetailValue}>{selectedRiskCourse.attendanceRate}%</Text>
                                </View>
                                <View style={styles.riskDetailItem}>
                                    <Text style={styles.riskDetailLabel}>Grades:</Text>
                                    <Text style={styles.riskDetailValue}>{selectedRiskCourse.grades || 0}%</Text>
                                </View>
                                <View style={styles.riskDetailItem}>
                                    <Text style={styles.riskDetailLabel}>GPA:</Text>
                                    <Text style={styles.riskDetailValue}>{studentData.gpa}</Text>
                                </View>
                                <View style={styles.riskDetailItem}>
                                    <Text style={styles.riskDetailLabel}>Timeliness:</Text>
                                    <Text style={styles.riskDetailValue}>{selectedRiskCourse.timeliness || 0}%</Text>
                                </View>
                                <View style={[styles.riskSummary, { backgroundColor: selectedRiskCourse.riskLevel?.color + '20' }]}>
                                    <Text style={[styles.riskSummaryText, { color: selectedRiskCourse.riskLevel?.color }]}>
                                        Overall Risk: {selectedRiskCourse.riskScore} - {selectedRiskCourse.riskLevel?.level}
                                    </Text>
                                </View>
                            </View>
                        )}
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
    toastWarning: { backgroundColor: '#f59e0b' },
    toastText: { color: 'white', fontWeight: 'bold', textAlign: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#f8fafc' },
    welcomeText: { fontSize: 16, color: '#64748b' },
    userName: { fontSize: 24, fontWeight: 'bold', color: '#1e293b' },
    userIdText: { fontSize: 14, color: '#4361ee', fontWeight: '600', marginTop: 2 },
    userEmailText: { fontSize: 12, color: '#64748b', marginTop: 2 },
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
    navItemActive: { backgroundColor: '#4361ee' },
    navItemPassword: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#e0f2fe', marginRight: 10 },
    navItemLogout: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fee2e2', marginRight: 10 },
    navText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
    navTextActive: { color: '#fff' },
    navTextPassword: { color: '#0284c7', fontWeight: '600', fontSize: 13 },
    navTextLogout: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
    searchContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#fff', 
        marginHorizontal: 20, 
        marginVertical: 10, 
        paddingHorizontal: 15, 
        borderRadius: 10, 
        borderWidth: 1, 
        borderColor: '#e2e8f0' 
    },
    searchIcon: { marginRight: 10 },
    searchInput: { flex: 1, paddingVertical: 12, color: '#1e293b', fontSize: 14 },
    mainContent: { padding: 20 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
    statCard: { width: '48%', backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 } },
    statLabel: { color: '#64748b', fontSize: 13, marginBottom: 5 },
    statValue: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
    statSmallLabel: { fontSize: 11, marginTop: 2 },
    sectionCard: { backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 8 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', flex: 1 },
    viewAllLink: { color: '#4361ee', fontSize: 12, fontWeight: '600' },
    scheduleItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    scheduleTime: { flexDirection: 'row', alignItems: 'center', width: 80, gap: 4 },
    scheduleTimeText: { color: '#64748b', fontSize: 12 },
    scheduleDetails: { flex: 1 },
    scheduleName: { fontWeight: '600', color: '#1e293b', fontSize: 14 },
    scheduleRoom: { color: '#64748b', fontSize: 11, marginTop: 2 },
    checkInMini: { backgroundColor: '#4361ee', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
    checkInMiniDisabled: { backgroundColor: '#94a3b8' },
    checkInMiniText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    activityItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    activityIconSuccess: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#22c55e20', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    activityText: { flex: 1 },
    activityTitle: { fontWeight: '600', color: '#1e293b', fontSize: 14 },
    activityTime: { color: '#64748b', fontSize: 11, marginTop: 2 },
    courseMiniCard: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    courseMiniHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    courseMiniCode: { color: '#4361ee', fontWeight: 'bold', fontSize: 12 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    statusChecked: { backgroundColor: '#22c55e20' },
    statusPending: { backgroundColor: '#f59e0b20' },
    statusBadgeText: { fontSize: 10, fontWeight: '600' },
    courseMiniName: { fontWeight: 'bold', color: '#1e293b', fontSize: 15, marginBottom: 2 },
    courseMiniInstructor: { color: '#64748b', fontSize: 12, marginBottom: 8 },
    courseMiniFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    courseMiniSchedule: { color: '#64748b', fontSize: 11 },
    courseMiniAttendance: { color: '#4361ee', fontWeight: 'bold', fontSize: 13 },
    trendContainer: { marginTop: 10 },
    chartBars: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 100 },
    barWrapper: { alignItems: 'center', width: 40 },
    bar: { width: 20, backgroundColor: '#4361ee', borderRadius: 10, minHeight: 20 },
    barLabel: { marginTop: 5, fontSize: 10, color: '#64748b', fontWeight: '500' },
    axisLabels: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 5 },
    axisLabel: { fontSize: 10, color: '#94a3b8' },
    gpsCard: { padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 20 },
    gpsActive: { backgroundColor: '#4361ee' },
    gpsInactive: { backgroundColor: '#f1f5f9' },
    gpsText: { marginTop: 8, fontSize: 14, fontWeight: '600' },
    fullPageCard: { backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 20 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerTitleText: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
    addButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4361ee', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 4 },
    addButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    emptyState: { alignItems: 'center', padding: 40 },
    emptyStateText: { color: '#64748b', marginTop: 10, marginBottom: 20, textAlign: 'center' },
    emptyStateButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4361ee', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, gap: 8 },
    emptyStateButtonText: { color: '#fff', fontWeight: 'bold' },
    courseCard: { backgroundColor: '#f8fafc', padding: 15, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' },
    courseCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    courseCardCode: { color: '#4361ee', fontWeight: 'bold', fontSize: 13 },
    courseCardName: { fontSize: 17, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
    courseCardInstructor: { color: '#64748b', fontSize: 13, marginBottom: 10 },
    courseDetails: { marginBottom: 15 },
    detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    detailText: { marginLeft: 6, color: '#475569', fontSize: 13 },
    courseCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, marginBottom: 10 },
    attendanceProgress: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 10 },
    progressBar: { flex: 1, height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, marginRight: 8 },
    progressFill: { height: 6, backgroundColor: '#4361ee', borderRadius: 3 },
    attendancePercent: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
    checkInButton: { backgroundColor: '#4361ee', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
    checkInButtonDisabled: { backgroundColor: '#94a3b8' },
    checkInButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    riskBadge: { padding: 8, borderRadius: 8, marginTop: 5 },
    riskBadgeText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
    attendanceSummary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
    summaryItem: { width: '48%', backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, marginBottom: 10 },
    summaryLabel: { color: '#64748b', fontSize: 12, marginBottom: 4 },
    summaryValue: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
    recordCard: { backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    recordHeader: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#f1f5f9', paddingBottom: 10, marginBottom: 10 },
    recordClass: { fontWeight: 'bold', color: '#4361ee' },
    recordName: { color: '#475569', fontSize: 13 },
    recordStats: { flexDirection: 'row', justifyContent: 'space-between' },
    rStat: { alignItems: 'center' },
    rsNum: { fontSize: 18, fontWeight: 'bold', color: '#22c55e' },
    rsLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
    scheduleDayCard: { marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    scheduleDayTitle: { fontSize: 15, fontWeight: 'bold', color: '#1e293b', marginBottom: 8 },
    noClasses: { color: '#94a3b8', fontSize: 12, fontStyle: 'italic', marginLeft: 10 },
    dayClass: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#f8fafc', borderRadius: 8, marginBottom: 5 },
    classTime: { fontSize: 12, fontWeight: '600', color: '#4361ee', width: 70 },
    className: { fontSize: 13, color: '#1e293b', flex: 1 },
    classRoom: { fontSize: 11, color: '#64748b', width: 60, textAlign: 'right' },
    profileView: { marginBottom: 20 },
    profileCard: { backgroundColor: '#fff', padding: 20, borderRadius: 16 },
    profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' },
    profileAvatarLarge: { marginRight: 15 },
    avatarLarge: { width: 80, height: 80, borderRadius: 40 },
    avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#4361ee', justifyContent: 'center', alignItems: 'center' },
    avatarPlaceholderText: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
    profileTitle: { flex: 1 },
    profileName: { fontSize: 20, fontWeight: 'bold', color: '#1e293b', marginBottom: 2 },
    profileEmail: { color: '#64748b', fontSize: 13, marginBottom: 2 },
    profileId: { color: '#4361ee', fontSize: 12, fontWeight: '600' },
    editProfileButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0f2fe', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 4 },
    editProfileText: { color: '#4361ee', fontSize: 12, fontWeight: '600' },
    profileDetails: { marginTop: 20 },
    detailSection: { marginBottom: 20 },
    detailSectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 12 },
    detailGrid: { backgroundColor: '#f8fafc', padding: 15, borderRadius: 12 },
    detailLabel: { color: '#64748b', fontSize: 13, width: 120 },
    detailValue: { color: '#1e293b', fontSize: 13, fontWeight: '500', flex: 1 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 20, maxHeight: '80%' },
    modalLarge: { width: '100%' },
    modalSmall: { width: '100%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
    modalSubtitle: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 15 },
    modalSearch: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, marginBottom: 15 },
    modalSearchIcon: { marginRight: 8 },
    modalSearchInput: { flex: 1, paddingVertical: 12, color: '#1e293b', fontSize: 14 },
    availableCourses: { maxHeight: 400 },
    availableCourseCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    courseCodeBadge: { backgroundColor: '#4361ee', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 10 },
    courseCodeBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
    availableCourseInfo: { flex: 1 },
    availableCourseName: { fontWeight: '600', color: '#1e293b', fontSize: 14, marginBottom: 2 },
    availableCourseInstructor: { color: '#64748b', fontSize: 11, marginBottom: 4 },
    availableCourseMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    metaText: { fontSize: 10, color: '#64748b' },
    addCourseConfirm: { backgroundColor: '#4361ee', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginLeft: 8 },
    addCourseConfirmText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    modalForm: { marginTop: 10 },
    formGroup: { marginBottom: 15 },
    formLabel: { fontSize: 13, fontWeight: '600', color: '#1e293b', marginBottom: 5 },
    formInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, color: '#1e293b' },
    passwordHint: { fontSize: 11, color: '#64748b', marginBottom: 20 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
    cancelButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f1f5f9' },
    cancelButtonText: { color: '#64748b', fontWeight: '600' },
    submitButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#4361ee' },
    submitButtonText: { color: '#fff', fontWeight: '600' },
    modalBody: { marginTop: 10 },
    detailItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    detailItemLabel: { color: '#64748b', fontSize: 13 },
    detailItemValue: { color: '#1e293b', fontSize: 13, fontWeight: '500' },
    riskDetailItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
    riskDetailLabel: { color: '#64748b', fontSize: 13 },
    riskDetailValue: { color: '#1e293b', fontSize: 13, fontWeight: '600' },
    riskSummary: { marginTop: 15, padding: 12, borderRadius: 8, alignItems: 'center' },
    riskSummaryText: { fontSize: 14, fontWeight: 'bold' },
    exportButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 4 },
    exportButtonText: { color: '#4361ee', fontSize: 12, fontWeight: '600' },
    noDataText: { color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 20 },
});