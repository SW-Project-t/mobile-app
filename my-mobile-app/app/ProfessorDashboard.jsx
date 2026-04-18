import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  TextInput, Modal, Alert, ActivityIndicator, 
  Platform, StatusBar, SafeAreaView, Image, Linking 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router'; 
import axios from 'axios';
import { auth, db } from './firebase'; 
import { collection, onSnapshot, query, deleteDoc, doc, updateDoc, getDoc, addDoc, serverTimestamp, orderBy, where, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import * as Location from 'expo-location'; 

const STORAGE_KEYS = {
    PROF_IMAGE: 'yallaclass_prof_image'
};

export default function ProfessorDashboard() {
  const router = useRouter(); 
  
  // Basic States
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [adminCourses, setAdminCourses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Professor Profile
  const [profData, setProfData] = useState({ name: 'Loading...', code: '...' });
  const [profileImage, setProfileImage] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Modals
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isDigitalIdModalOpen, setIsDigitalIdModalOpen] = useState(false);
  const [showCoursePicker, setShowCoursePicker] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedCourse, setSelectedCourse] = useState(null);

  // Live Attendance State
  const [attendanceCode, setAttendanceCode] = useState('');
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [activeSessions, setActiveSessions] = useState({});
  const [cumulativeAttendanceStats, setCumulativeAttendanceStats] = useState({ courses: [], overall: {} });

  // Messages States
  const [messages, setMessages] = useState([]);
  const [adminMessages, setAdminMessages] = useState([]);
  const [studentMessages, setStudentMessages] = useState([]);
  const [unreadAdminCount, setUnreadAdminCount] = useState(0);
  const [unreadStudentCount, setUnreadStudentCount] = useState(0);
  const [isMessageToAdminModalOpen, setIsMessageToAdminModalOpen] = useState(false);
  const [isMessageToStudentModalOpen, setIsMessageToStudentModalOpen] = useState(false);
  const [messageToAdminText, setMessageToAdminText] = useState('');
  const [messageToAdminSubject, setMessageToAdminSubject] = useState('');
  const [messageToStudentText, setMessageToStudentText] = useState('');
  const [messageToStudentSubject, setMessageToStudentSubject] = useState('');
  const [selectedStudentForMessage, setSelectedStudentForMessage] = useState(null);
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [selectedMessageDetail, setSelectedMessageDetail] = useState(null);

  // Forms Data
  const [newCourse, setNewCourse] = useState({ 
    id: '', name: '', schedule: '', room: '', students: '', capacity: '' 
  });
  
  const [passwordFields, setPasswordFields] = useState({
    currentPassword: '', newPassword: '', confirmPassword: ''
  });

  const [editFieldValue, setEditFieldValue] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  useEffect(() => {
    const loadSavedImage = async () => {
      try {
        const savedImage = await AsyncStorage.getItem(STORAGE_KEYS.PROF_IMAGE);
        if (savedImage) setProfileImage(savedImage);
      } catch (e) { console.error(e); }
    };
    loadSavedImage();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const docRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(docRef);
          const token = await AsyncStorage.getItem('token');
          if(!token){
              router.replace('/');
          } else if (docSnap.exists()) {
            const data = docSnap.data();
            setProfData({
              name: data.fullName || "Dr. Anonymous",
              code: data.code || "No Code"
            });
            setProfileImage(data.profileImage || null);
          }
        } catch (error) {
          console.error("Error fetching admin data:", error);
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

  useEffect(() => {
    const fetchAdminCourses = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "courses"));
            const coursesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAdminCourses(coursesList);
        } catch (error) {}
    };
    fetchAdminCourses();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(db, "professorCourses"), where("professorId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const professorCoursesList = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: data.courseId, name: data.courseName, schedule: data.schedule, room: data.room,
                capacity: data.capacity || 0, students: data.students || 0, avgAttendance: data.avgAttendance || 0,
                todayPresent: data.todayPresent || 0, todayLate: data.todayLate || 0, todayAbsent: data.todayAbsent || 0,
            };
        });
        setCourses(professorCoursesList);
    });
    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(db, "active_sessions"), where("professorId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
        let sessions = {};
        snap.forEach(doc => { sessions[doc.id] = true; });
        setActiveSessions(sessions);
    });
    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    const q = query(collection(db, "users"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const usersArray = [];
      querySnapshot.forEach((document) => {
        usersArray.push({ id: document.id, ...document.data() });
      });
      setUsers(usersArray);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const qAdmin = query(collection(db, "messages"), where("to", "==", "professor"), where("toId", "==", user.uid), orderBy("createdAt", "desc"));
    const unsubscribeAdmin = onSnapshot(qAdmin, (querySnapshot) => {
        const messagesArray = [];
        let unread = 0;
        querySnapshot.forEach((doc) => {
            const messageData = { id: doc.id, ...doc.data() };
            if (messageData.from === 'admin') {
                messagesArray.push(messageData);
                if (!messageData.read) unread++;
            }
        });
        setAdminMessages(messagesArray);
        setUnreadAdminCount(unread);
    });
    return () => unsubscribeAdmin();
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const qStudent = query(collection(db, "messages"), where("to", "==", "professor"), where("toId", "==", user.uid), where("from", "==", "student"), orderBy("createdAt", "desc"));
    const unsubscribeStudent = onSnapshot(qStudent, (querySnapshot) => {
        const messagesArray = [];
        let unread = 0;
        querySnapshot.forEach((doc) => {
            const messageData = { id: doc.id, ...doc.data() };
            messagesArray.push(messageData);
            if (!messageData.read) unread++;
        });
        setStudentMessages(messagesArray);
        setUnreadStudentCount(unread);
    });
    return () => unsubscribeStudent();
  }, [auth.currentUser?.uid]);

  const showNotification = (message, type = 'success') => {
      setToast({ show: true, message, type });
      setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const studentUsers = users.filter(u => u.role === 'student');
  const totalStudentsCount = courses.reduce((sum, c) => sum + (c.students || 0), 0);
  const avgAttendance = Math.round(courses.reduce((sum, c) => sum + (c.avgAttendance || 0), 0) / (courses.length || 1));
  const totalPresent = courses.reduce((sum, c) => sum + (c.todayPresent || 0), 0);

  const filteredCourses = useMemo(() => {
      return courses.filter(c => 
          c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
          c.id?.toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [courses, searchQuery]);

  const adminMessagesList = [...adminMessages, ...studentMessages].sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
      return dateB - dateA;
  });

  const getAttendanceColor = (rate) => {
      if (rate >= 85) return '#10b981';
      if (rate >= 70) return '#f59e0b';
      if (rate >= 50) return '#f97316';
      return '#ef4444';
  };

  const handleImageUpload = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Notice", "Permission required!");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.5,
    });
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setProfileImage(uri);
      await AsyncStorage.setItem(STORAGE_KEYS.PROF_IMAGE, uri);
    }
  };

  const openDigitalID = () => setIsDigitalIdModalOpen(true);
  const closeDigitalID = () => setIsDigitalIdModalOpen(false);

  const resetDailyAttendance = async (courseId) => {
      try {
          const user = auth.currentUser;
          const q = query(collection(db, "professorCourses"), where("professorId", "==", user.uid), where("courseId", "==", courseId));
          const querySnapshot = await getDocs(q);
          querySnapshot.forEach(async (document) => {
              await updateDoc(doc(db, "professorCourses", document.id), { todayPresent: 0, todayLate: 0, todayAbsent: 0 });
          });
          showNotification(`Attendance reset for ${courseId}`);
      } catch (e) {
          showNotification('Failed to reset attendance', 'error');
      }
  };

  const resetAllAttendance = () => {
      Alert.alert('Reset Attendance', 'Reset today\'s attendance for ALL courses?', [
          { text: 'Cancel', style: 'cancel' },
          { 
              text: 'Reset', style: 'destructive', 
              onPress: () => {
                  courses.forEach(c => resetDailyAttendance(c.id));
                  showNotification('All courses reset for the day');
              } 
          }
      ]);
  };

  const openAddModal = () => {
      setModalType('add');
      setNewCourse({ id: '', name: '', schedule: '', room: '', students: '', capacity: '' });
      setShowModal(true);
  };

  const openAttendanceModal = (course) => {
      setModalType('attendance');
      setSelectedCourse(course);
      setAttendanceCode(Math.floor(1000 + Math.random() * 9000).toString()); 
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
              courseId: selectedCourse.id, courseName: selectedCourse.name,
              professorId: auth.currentUser.uid, professorName: profData.name,
              attendanceCode: attendanceCode, latitude: profLat, longitude: profLon,
              isActive: true, createdAt: new Date().toISOString()
          };

          await setDoc(doc(db, "active_sessions", selectedCourse.id), sessionData);
          showNotification('Attendance session started successfully!');
          setShowModal(false);
      } catch (error) {
          showNotification('Failed to start session. Check GPS/Network.', 'error');
      } finally {
          setIsStartingSession(false);
      }
  };

  const endLiveAttendanceSession = async (courseId) => {
      Alert.alert("End Attendance", "Are you sure you want to close attendance for this course?", [
          { text: "Cancel", style: "cancel" },
          { text: "Close Session", style: "destructive", onPress: async () => {
                  try {
                      await deleteDoc(doc(db, "active_sessions", courseId));
                      showNotification('Attendance session closed successfully.', 'success');
                  } catch (error) {
                      showNotification('Failed to close session.', 'error');
                  }
              } 
          }
      ]);
  };

  const handleSelectCourseFromAdmin = (course) => {
      if (course) {
          setNewCourse({
              id: course.courseId || '', name: course.courseName || '',
              schedule: course.schedule || `${course.SelectDays || ''} | ${course.Time || ''}`,
              room: course.RoomNumber || '', students: course.totalStudents?.toString() || '0',
              capacity: course.capacity?.toString() || '0'
          });
          setShowCoursePicker(false);
      }
  };

  const saveCourse = async () => {
      if (!newCourse.id || !newCourse.name) return;
      if (courses.some(c => c.id === newCourse.id)) {
          showNotification('This course is already in your list', 'error'); return;
      }
      try {
          const user = auth.currentUser;
          const courseToAdd = {
              courseId: newCourse.id, courseName: newCourse.name, schedule: newCourse.schedule,
              room: newCourse.room, capacity: parseInt(newCourse.capacity) || 0,
              students: parseInt(newCourse.students) || 0, avgAttendance: 0, todayPresent: 0,
              todayLate: 0, todayAbsent: 0, professorId: user.uid, professorName: profData.name,
              professorCode: profData.code, assignedAt: new Date().toISOString()
          };
          await addDoc(collection(db, "professorCourses"), { ...courseToAdd, userId: user.uid });    
          showNotification(`Course ${newCourse.id} added successfully`);
          setShowModal(false);
      } catch (error) { showNotification('Error saving course.', 'error'); }
  };

  const deleteCourse = async (id) => {
      Alert.alert('Delete Course', 'Are you sure you want to delete this course?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: "destructive", onPress: async () => {
                  try {
                      const user = auth.currentUser;
                      const q = query(collection(db, "professorCourses"), where("professorId", "==", user.uid), where("courseId", "==", id));
                      const querySnapshot = await getDocs(q);
                      querySnapshot.forEach(async (document) => { await deleteDoc(doc(db, "professorCourses", document.id)); });
                      showNotification(`Course ${id} deleted successfully`);
                  } catch (error) { showNotification('Error deleting course', 'error'); }
              } 
          }
      ]);
  };

  const handleEdit = (item) => {
    setSelectedItem(item);
    setEditFieldValue(item.room || item.RoomNumber || "");
    setIsEditModalOpen(true);
  };

  const handleView = (item) => {
    setSelectedItem(item);
    setIsViewModalOpen(true);
  };

  const handleSaveChanges = async () => {
    try {
      const q = query(collection(db, "professorCourses"), where("courseId", "==", selectedItem.id));
      const snap = await getDocs(q);
      snap.forEach(async (document) => {
          await updateDoc(doc(db, "professorCourses", document.id), { room: editFieldValue });
      });
      showNotification("Updated successfully!");
      setIsEditModalOpen(false);
    } catch (error) { showNotification("Error updating course", "error"); }
  };

  const handlePasswordUpdate = async () => {
    const user = auth.currentUser;
    if (passwordFields.newPassword !== passwordFields.confirmPassword) {
      showNotification("New passwords do not match!", 'error'); return;
    }
    try {
      const credential = EmailAuthProvider.credential(user.email, passwordFields.currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwordFields.newPassword);
      showNotification("Password updated successfully!", "success");
      setIsPasswordModalOpen(false);
      setPasswordFields({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) { showNotification("Check your current password.", "error"); }
  };

  const handleSendMessageToStudent = async () => {
      try {
          const messageData = {
              from: 'professor', fromId: auth.currentUser?.uid, fromName: profData.name,
              to: 'student', toId: selectedStudentForMessage.id, toName: selectedStudentForMessage.fullName,
              subject: messageToStudentSubject.trim() || 'No Subject', message: messageToStudentText.trim(),
              createdAt: serverTimestamp(), read: false, adminRead: true
          };
          await addDoc(collection(db, "messages"), messageData);
          showNotification(`Message sent successfully!`, 'success');
          setIsMessageToStudentModalOpen(false); setSelectedStudentForMessage(null); setMessageToStudentText(''); setMessageToStudentSubject('');
      } catch (error) { showNotification("Failed to send message", 'error'); }
  };

  const handleSendMessageToAdmin = async () => {
      try {
          const messageData = {
              from: 'professor', fromId: auth.currentUser?.uid, fromName: profData.name,
              to: 'admin', toId: 'admin', toName: 'System Admin',
              subject: messageToAdminSubject.trim() || 'No Subject', message: messageToAdminText.trim(),
              createdAt: serverTimestamp(), read: false, adminRead: false
          };
          await addDoc(collection(db, "messages"), messageData);
          showNotification("Message sent to Admin successfully!", 'success');
          setIsMessageToAdminModalOpen(false); setMessageToAdminText(''); setMessageToAdminSubject('');
      } catch (error) { showNotification("Failed to send message", 'error'); }
  };

  const markMessageAsRead = async (message) => {
    try {
        setSelectedMessageDetail(message);
        if (!message.read) {
            await updateDoc(doc(db, "messages", message.id), { read: true });
        }
    } catch (error) {}
  };

  const exportData = () => { showNotification('Data exported to console'); };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", style: "destructive", onPress: async () => {
            try {
              await AsyncStorage.removeItem('token'); 
              await AsyncStorage.removeItem(STORAGE_KEYS.PROF_IMAGE);
              router.replace('/'); 
            } catch (error) {}
          } 
        }
      ]);
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#4361ee" /></View>;

  // ---------------- RENDER ----------------
  const renderDashboard = () => (
    <View>
      <View style={styles.quickActionsGrid}>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#4361ee'}]} onPress={openAddModal}>
          <Feather name="book-open" size={20} color="#fff" />
          <Text style={styles.actionBtnText}>New Course</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#10b981'}]} onPress={() => setActiveTab('Messages')}>
          <Feather name="message-square" size={20} color="#fff" />
          <Text style={styles.actionBtnText}>Messages</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#f59e0b'}]} onPress={exportData}>
          <Feather name="download" size={20} color="#fff" />
          <Text style={styles.actionBtnText}>Export Data</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#ef4444'}]} onPress={resetAllAttendance}>
          <Feather name="clock" size={20} color="#fff" />
          <Text style={styles.actionBtnText}>Reset Today</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
          <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Courses</Text>
              <Text style={[styles.statValue, {color: '#4361ee'}]}>{courses.length}</Text>
          </View>
          <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Students</Text>
              <Text style={[styles.statValue, {color: '#10b981'}]}>{totalStudentsCount}</Text>
          </View>
          <View style={styles.statCard}>
              <Text style={styles.statLabel}>Avg Attendance</Text>
              <Text style={[styles.statValue, {color: '#8b5cf6'}]}>{avgAttendance}%</Text>
          </View>
          <View style={styles.statCard}>
              <Text style={styles.statLabel}>Present Today</Text>
              <Text style={[styles.statValue, {color: '#f59e0b'}]}>{totalPresent}</Text>
          </View>
      </View>

      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={styles.tableTitle}>Recent Courses Added</Text>
          <TouchableOpacity onPress={() => setActiveTab('My Courses')}>
            <Text style={styles.viewAllLink}>View All</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ minWidth: 400 }}>
            {filteredCourses.slice(0, 4).length === 0 ? (
              <Text style={styles.emptyText}>No data</Text>
            ) : (
              filteredCourses.slice(0, 4).map(c => (
                <View key={c.id} style={styles.tableRow}>
                  <View style={styles.courseInfo}>
                    <Text style={styles.courseCodeText}>{c.id}</Text>
                    <Text style={styles.courseNameText} numberOfLines={1}>{c.name}</Text>
                  </View>
                  <View style={styles.rowActions}>
                    <TouchableOpacity onPress={() => handleView(c)} style={styles.actionIcon}>
                      <Feather name="eye" size={16} color="#2196f3" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleEdit(c)} style={styles.actionIcon}>
                      <Feather name="edit-2" size={16} color="#4caf50" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteCourse(c.id)} style={styles.actionIcon}>
                      <Feather name="trash-2" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );

  const renderMyCourses = () => (
    <View style={styles.fullPageTable}>
      <View style={styles.tableHeader}>
        <View style={styles.headerTitle}>
          <Feather name="book-open" size={24} color="#4361ee" />
          <Text style={styles.headerTitleText}>My Courses ({filteredCourses.length})</Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={openAddModal}>
          <Feather name="plus" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Add Course</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.headerCell, { width: 90 }]}>Code</Text>
            <Text style={[styles.headerCell, { width: 180 }]}>Course Name</Text>
            <Text style={[styles.headerCell, { width: 120 }]}>Schedule</Text>
            <Text style={[styles.headerCell, { width: 80 }]}>Room</Text>
            <Text style={[styles.headerCell, { width: 80 }]}>Students</Text>
            <Text style={[styles.headerCell, { width: 110 }]}>Attendance %</Text>
            <Text style={[styles.headerCell, { width: 140 }]}>Today's Attend.</Text>
            <Text style={[styles.headerCell, { width: 120 }]}>Live Session</Text>
            <Text style={[styles.headerCell, { width: 140 }]}>Actions</Text>
          </View>

          {filteredCourses.length === 0 ? (
            <Text style={styles.emptyText}>No data</Text>
          ) : (
            filteredCourses.map(c => {
                const attRate = c.avgAttendance || 0;
                return (
                    <View key={c.id} style={styles.tableRow}>
                        <Text style={[styles.cell, { width: 90 }]}>{c.id}</Text>
                        <Text style={[styles.cell, styles.boldCell, { width: 180 }]} numberOfLines={1}>{c.name}</Text>
                        <Text style={[styles.cell, { width: 120 }]} numberOfLines={1}>{c.schedule}</Text>
                        <Text style={[styles.cell, { width: 80 }]}>{c.room}</Text>
                        <Text style={[styles.cell, { width: 80, fontWeight: 'bold' }]}>{c.students || 0}</Text>
                        
                        <View style={[styles.cell, { width: 110 }]}>
                            <Text style={{ color: getAttendanceColor(attRate), fontWeight: 'bold' }}>{attRate}%</Text>
                            <View style={styles.miniAttendanceBar}>
                                <View style={[styles.miniAttendanceFill, { width: `${attRate}%`, backgroundColor: getAttendanceColor(attRate) }]} />
                            </View>
                        </View>

                        <View style={[styles.cell, { width: 140 }]}>
                            <View style={styles.todayAttendanceRow}>
                                <Text style={styles.presentBadge}>P: {c.todayPresent || 0}</Text>
                                <Text style={styles.lateBadge}>L: {c.todayLate || 0}</Text>
                                <Text style={styles.absentBadge}>A: {c.todayAbsent || 0}</Text>
                            </View>
                        </View>

                        <View style={[styles.cell, { width: 120 }]}>
                            {activeSessions[c.id] ? (
                                <TouchableOpacity style={[styles.startAttendanceBtn, { backgroundColor: '#ef4444' }]} onPress={() => endLiveAttendanceSession(c.id)}>
                                    <Text style={styles.startAttendanceText}>End Session</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.startAttendanceBtn} onPress={() => openAttendanceModal(c)}>
                                    <Text style={styles.startAttendanceText}>Start Session</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={[styles.cell, { width: 140, flexDirection: 'row', gap: 10 }]}>
                            <TouchableOpacity onPress={() => resetDailyAttendance(c.id)} style={styles.actionIcon}><Feather name="clock" size={18} color="#f59e0b" /></TouchableOpacity>
                            <TouchableOpacity onPress={() => handleEdit(c)} style={styles.actionIcon}><Feather name="edit-2" size={18} color="#4caf50" /></TouchableOpacity>
                            <TouchableOpacity onPress={() => { setSelectedStudentForMessage({ id: 'all', studentName: 'All Students' }); setIsMessageToStudentModalOpen(true); }} style={styles.actionIcon}><Feather name="mail" size={18} color="#4361ee" /></TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteCourse(c.id)} style={styles.actionIcon}><Feather name="trash-2" size={18} color="#ef4444" /></TouchableOpacity>
                        </View>
                    </View>
                )
            })
          )}
        </View>
      </ScrollView>
    </View>
  );

  const renderMessages = () => (
      <View>
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10}}>
              <Feather name="message-square" size={24} color="#4361ee" />
              <Text style={styles.sectionTitle}>Message Center</Text>
          </View>

          <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Unread from Admin</Text>
                  <Text style={[styles.statValue, {color: '#4361ee'}]}>{unreadAdminCount}</Text>
              </View>
              <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Unread from Students</Text>
                  <Text style={[styles.statValue, {color: '#10b981'}]}>{unreadStudentCount}</Text>
              </View>
          </View>

          <View style={{flexDirection: 'row', gap: 10, marginBottom: 20}}>
              <TouchableOpacity 
                  style={[styles.actionBtn, {flex: 1, backgroundColor: '#4361ee'}]}
                  onPress={() => {
                      setMessageToAdminText('');
                      setMessageToAdminSubject('');
                      setIsMessageToAdminModalOpen(true);
                  }}
              >
                  <Feather name="shield" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Message Admin</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                  style={[styles.actionBtn, {flex: 1, backgroundColor: '#10b981'}]}
                  onPress={() => {
                      setSelectedStudentForMessage(null);
                      setMessageToStudentText('');
                      setMessageToStudentSubject('');
                      setIsMessageToStudentModalOpen(true);
                  }}
              >
                  <Feather name="users" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Message Student</Text>
              </TouchableOpacity>
          </View>

          <View style={styles.fullPageTable}>
              <Text style={{fontWeight: 'bold', fontSize: 16, marginBottom: 15, color: '#1e293b'}}>Inbox</Text>
              {adminMessagesList.length === 0 ? (
                  <Text style={styles.emptyText}>No messages yet</Text>
              ) : (
                  adminMessagesList.map(msg => (
                      <TouchableOpacity 
                          key={msg.id} 
                          style={[styles.messageItem, !msg.read && styles.messageItemUnread]}
                          onPress={() => markMessageAsRead(msg)}
                      >
                          <View style={[styles.messageAvatar, msg.from === 'student' && {backgroundColor: '#10b981'}]}>
                              <Text style={{color: '#fff', fontWeight: 'bold'}}>{msg.fromName?.charAt(0).toUpperCase() || 'U'}</Text>
                          </View>
                          <View style={{flex: 1, marginLeft: 10}}>
                              <Text style={{fontWeight: 'bold', color: '#1e293b'}}>{msg.fromName} ({msg.from})</Text>
                              <Text style={{fontSize: 12, color: '#4a90e2', marginVertical: 3}}>{msg.subject}</Text>
                              <Text numberOfLines={2} style={{color: '#64748b', fontSize: 13}}>{msg.message}</Text>
                          </View>
                          {!msg.read && <View style={styles.unreadDot} />}
                      </TouchableOpacity>
                  ))
              )}
          </View>
      </View>
  );

  const renderUnderDevelopment = () => (
    <View style={styles.developmentContainer}>
      <Feather name="settings" size={60} color="#94a3b8" />
      <Text style={styles.developmentText}>This feature is active in the Web Version.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {toast.show && (
          <View style={[styles.toast, toast.type === 'error' ? styles.toastError : styles.toastSuccess]}>
              <Text style={styles.toastText}>{toast.message}</Text>
          </View>
      )}

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{profData.name}</Text>
          <Text style={styles.headerSubtitle}>ID: {profData.code}</Text>
        </View>
        <View style={{flexDirection: 'row', alignItems:'center', gap: 15}}>
            <TouchableOpacity onPress={() => setActiveTab('Messages')} style={{position: 'relative'}}>
                <Feather name="bell" size={24} color="#64748b" />
                {(unreadAdminCount + unreadStudentCount) > 0 && (
                    <View style={styles.notificationBadge}>
                        <Text style={styles.badgeText}>{unreadAdminCount + unreadStudentCount}</Text>
                    </View>
                )}
            </TouchableOpacity>
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
      </View>

      <View style={styles.searchContainer}>
        <Feather name="search" size={18} color="#94a3b8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search here..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#94a3b8"
        />
      </View>

      {/* الشريط تم فيه ترتيب التابات وإضافة الـ Logout والـ Students والـ LMS اللي رجعوا */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topNav} contentContainerStyle={styles.topNavContent}>
        <TouchableOpacity style={[styles.navItem, activeTab === 'Dashboard' && styles.navItemActive]} onPress={() => setActiveTab('Dashboard')}>
          <Text style={[styles.navText, activeTab === 'Dashboard' && styles.navTextActive]}>Dashboard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navItem, activeTab === 'My Courses' && styles.navItemActive]} onPress={() => setActiveTab('My Courses')}>
          <Text style={[styles.navText, activeTab === 'My Courses' && styles.navTextActive]}>My Courses</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navItem, activeTab === 'Students' && styles.navItemActive]} onPress={() => setActiveTab('Students')}>
          <Text style={[styles.navText, activeTab === 'Students' && styles.navTextActive]}>Students</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navItem, activeTab === 'LMS' && styles.navItemActive]} onPress={() => setActiveTab('LMS')}>
          <Text style={[styles.navText, activeTab === 'LMS' && styles.navTextActive]}>LMS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navItem, activeTab === 'Analytics' && styles.navItemActive]} onPress={() => setActiveTab('Analytics')}>
          <Text style={[styles.navText, activeTab === 'Analytics' && styles.navTextActive]}>Analytics</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navItem, activeTab === 'Messages' && styles.navItemActive]} onPress={() => setActiveTab('Messages')}>
          <Text style={[styles.navText, activeTab === 'Messages' && styles.navTextActive]}>Messages</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.navItem, styles.navItemLogout]} onPress={handleLogout}>
          <Feather name="log-out" size={14} color="#ef4444" />
          <Text style={styles.navTextLogout}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'Dashboard' && renderDashboard()}
        {activeTab === 'My Courses' && renderMyCourses()}
        {activeTab === 'Messages' && renderMessages()}
        {(activeTab === 'Students' || activeTab === 'LMS' || activeTab === 'Analytics') && renderUnderDevelopment()}
        
        <View style={{height: 30}} />
      </ScrollView>

      {/* الـ zIndex متظبط عشان الزرار ميخفيش حاجة */}
      <TouchableOpacity style={styles.passwordFloatingButton} onPress={openDigitalID}>
        <Feather name="shield" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Modals */}
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
                          <View style={styles.modalActions}>
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
                              <Text>{newCourse.id ? `${newCourse.id} - ${newCourse.name}` : 'Select Course from Admin List...'}</Text>
                          </TouchableOpacity>
                          <View style={styles.modalActions}>
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

      {/* Message Admin Modal */}
      <Modal visible={isMessageToAdminModalOpen} transparent animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, {maxHeight: '80%'}]}>
                  <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Message Admin</Text>
                      <TouchableOpacity onPress={() => setIsMessageToAdminModalOpen(false)}>
                          <Feather name="x" size={24} color="#64748b" />
                      </TouchableOpacity>
                  </View>
                  <ScrollView>
                      <TextInput 
                          style={styles.input} 
                          placeholder="Subject (Optional)" 
                          value={messageToAdminSubject} 
                          onChangeText={setMessageToAdminSubject} 
                      />
                      <TextInput 
                          style={[styles.input, {height: 100, textAlignVertical: 'top'}]} 
                          placeholder="Type your message here..." 
                          multiline 
                          value={messageToAdminText} 
                          onChangeText={setMessageToAdminText} 
                      />
                      <View style={styles.modalActions}>
                          <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsMessageToAdminModalOpen(false)}>
                              <Text style={styles.cancelText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.submitBtn, {backgroundColor: '#4361ee'}]} onPress={handleSendMessageToAdmin}>
                              <Text style={styles.submitText}>Send</Text>
                          </TouchableOpacity>
                      </View>
                  </ScrollView>
              </View>
          </View>
      </Modal>

      {/* Message Student Modal */}
      <Modal visible={isMessageToStudentModalOpen} transparent animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, {maxHeight: '80%'}]}>
                  <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Message Student</Text>
                      <TouchableOpacity onPress={() => setIsMessageToStudentModalOpen(false)}>
                          <Feather name="x" size={24} color="#64748b" />
                      </TouchableOpacity>
                  </View>
                  <ScrollView>
                      <TouchableOpacity style={styles.pickerButton} onPress={() => setShowStudentPicker(true)}>
                          <Text>{selectedStudentForMessage ? `${selectedStudentForMessage.fullName} (${selectedStudentForMessage.code})` : 'Select Student...'}</Text>
                      </TouchableOpacity>
                      <TextInput 
                          style={styles.input} 
                          placeholder="Subject (Optional)" 
                          value={messageToStudentSubject} 
                          onChangeText={setMessageToStudentSubject} 
                      />
                      <TextInput 
                          style={[styles.input, {height: 100, textAlignVertical: 'top'}]} 
                          placeholder="Type your message here..." 
                          multiline 
                          value={messageToStudentText} 
                          onChangeText={setMessageToStudentText} 
                      />
                      <View style={styles.modalActions}>
                          <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsMessageToStudentModalOpen(false)}>
                              <Text style={styles.cancelText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.submitBtn, {backgroundColor: '#10b981'}]} onPress={handleSendMessageToStudent}>
                              <Text style={styles.submitText}>Send</Text>
                          </TouchableOpacity>
                      </View>
                  </ScrollView>
              </View>
          </View>
      </Modal>

      {/* Student Picker Modal */}
      <Modal visible={showStudentPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                  <Text style={styles.modalTitle}>Select Student</Text>
                  <ScrollView>
                      {studentUsers.map((student, index) => (
                          <TouchableOpacity 
                              key={index} 
                              style={styles.pickerItem} 
                              onPress={() => {
                                  setSelectedStudentForMessage(student);
                                  setShowStudentPicker(false);
                              }}
                          >
                              <Text style={{fontWeight: 'bold'}}>{student.fullName}</Text>
                              <Text style={{color: '#64748b', fontSize: 12}}>{student.code}</Text>
                          </TouchableOpacity>
                      ))}
                  </ScrollView>
                  <TouchableOpacity style={[styles.cancelBtn, {marginTop: 10}]} onPress={() => setShowStudentPicker(false)}>
                      <Text style={{textAlign: 'center'}}>Close</Text>
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>

      {/* View Message Detail Modal */}
      <Modal visible={selectedMessageDetail !== null} transparent animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Message Details</Text>
                  <View style={styles.messageDetailBox}>
                      <Text style={{fontWeight: 'bold'}}>Subject: {selectedMessageDetail?.subject}</Text>
                      <Text style={{color: '#64748b', fontSize: 12, marginVertical: 10}}>From: {selectedMessageDetail?.fromName} ({selectedMessageDetail?.from})</Text>
                      <Text style={{fontSize: 15, lineHeight: 22, color: '#1e293b'}}>{selectedMessageDetail?.message}</Text>
                  </View>
                  <TouchableOpacity style={styles.submitBtn} onPress={() => setSelectedMessageDetail(null)}>
                      <Text style={styles.submitText}>Close</Text>
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>

      {/* View Course Modal */}
      <Modal visible={isViewModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.viewModal]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Text style={styles.modalTitle}>Course Details</Text>
              </View>
              <TouchableOpacity onPress={() => setIsViewModalOpen(false)}>
                <Feather name="x" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.viewContent}>
                  <View style={styles.viewGrid}>
                    <View style={styles.viewItem}>
                      <View style={styles.viewLabel}>
                        <Text style={styles.viewLabelText}>Course Name</Text>
                      </View>
                      <Text style={styles.viewValue}>{selectedItem.name || selectedItem.courseName}</Text>
                    </View>
                    <View style={styles.viewItem}>
                      <View style={styles.viewLabel}>
                        <Text style={styles.viewLabelText}>Course Code</Text>
                      </View>
                      <Text style={[styles.viewValue, styles.idValue]}>{selectedItem.id || selectedItem.courseId}</Text>
                    </View>
                    <View style={styles.viewItem}>
                      <View style={styles.viewLabel}>
                        <Text style={styles.viewLabelText}>Schedule</Text>
                      </View>
                      <Text style={styles.viewValue}>{selectedItem.schedule || selectedItem.SelectDays}</Text>
                    </View>
                    <View style={styles.viewItem}>
                      <View style={styles.viewLabel}>
                        <Text style={styles.viewLabelText}>Room</Text>
                      </View>
                      <Text style={styles.viewValue}>{selectedItem.room || selectedItem.RoomNumber}</Text>
                    </View>
                  </View>
                </View>
                
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsViewModalOpen(false)}>
                    <Text style={styles.cancelText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={isEditModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.smallModal]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Text style={styles.modalTitle}>Update Details</Text>
              </View>
              <TouchableOpacity onPress={() => setIsEditModalOpen(false)}>
                <Feather name="x" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <ScrollView>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Course Name (Read Only)</Text>
                  <TextInput 
                    style={[styles.input, styles.disabledInput]} 
                    value={selectedItem.name || selectedItem.courseName || ''} 
                    editable={false} 
                  />
                </View>
                
                <View style={styles.formGroup}>
                  <Text style={styles.label}>New Room Number</Text>
                  <TextInput 
                    style={styles.input} 
                    value={editFieldValue} 
                    onChangeText={setEditFieldValue} 
                    placeholder="Enter new room number"
                  />
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditModalOpen(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.submitBtn, styles.successBtn]} onPress={handleSaveChanges}>
                    <Text style={styles.submitText}>Update</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Password Modal */}
      <Modal visible={isPasswordModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.smallModal]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Text style={styles.modalTitle}>Change Password</Text>
              </View>
              <TouchableOpacity onPress={() => setIsPasswordModalOpen(false)}>
                <Feather name="x" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View>
              <TextInput 
                style={styles.input}
                placeholder="Current Password"
                secureTextEntry
                value={passwordFields.currentPassword}
                onChangeText={t => setPasswordFields({...passwordFields, currentPassword: t})}
              />
              <TextInput 
                style={styles.input}
                placeholder="New Password"
                secureTextEntry
                value={passwordFields.newPassword}
                onChangeText={t => setPasswordFields({...passwordFields, newPassword: t})}
              />
              <TextInput 
                style={styles.input}
                placeholder="Confirm Password"
                secureTextEntry
                value={passwordFields.confirmPassword}
                onChangeText={t => setPasswordFields({...passwordFields, confirmPassword: t})}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsPasswordModalOpen(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} onPress={handlePasswordUpdate}>
                  <Text style={styles.submitText}>Update</Text>
                </TouchableOpacity>
              </View>
            </View>
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
                              name: profData.name, id: profData.code, role: "Professor"
                          })} 
                          size={150} color="#4361ee" 
                      />
                      <Text style={{marginTop: 15, fontWeight: 'bold', fontSize: 18}}>{profData.name}</Text>
                      <Text style={{color: '#64748b'}}>{profData.code}</Text>
                  </View>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsDigitalIdModalOpen(false)}>
                      <Text style={{textAlign: 'center', fontWeight: 'bold', color: '#64748b'}}>Close</Text>
                  </TouchableOpacity>
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 40) + 15 : 45 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderColor: '#e2e8f0' 
  },
  headerSubtitle: { color: '#64748b', fontSize: 13, fontWeight: '600', marginTop: 2 },
  headerTitle: { color: '#1e293b', fontSize: 20, fontWeight: 'bold' },
  userAvatar: { backgroundColor: '#4361ee', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  userAvatarImage: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: '#4361ee' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  notificationBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#ef4444', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: 'white', fontSize: 9, fontWeight: 'bold' },
  digitalIdButton: { backgroundColor: '#4a90e2', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 15, marginTop: 5, alignSelf: 'flex-start', gap: 4 },
  digitalIdButtonText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 15, paddingHorizontal: 15, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#1e293b' },
  
  topNav: { backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#e2e8f0', maxHeight: 60 },
  topNavContent: { paddingRight: 20 },
  navItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', marginHorizontal: 5, gap: 6 },
  navItemActive: { backgroundColor: '#4361ee' },
  navItemLogout: { backgroundColor: '#fee2e2', marginLeft: 15 }, 
  navText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  navTextActive: { color: '#fff', fontWeight: '600', fontSize: 13 },
  navTextLogout: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
  
  mainContent: { padding: 15, flex: 1 },
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20, gap: 10 },
  actionBtn: { width: '48%', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 2, marginBottom: 10 },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  middleRowGrid: { gap: 15, marginBottom: 20 },
  
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 15 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
  deptRow: { marginBottom: 15 },
  deptHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  deptName: { color: '#475569', fontWeight: '500' },
  deptCount: { fontWeight: 'bold', color: '#1e293b' },
  progressBarBg: { height: 8, backgroundColor: '#f1f5f9', borderRadius: 4 },
  progressBarFill: { height: '100%', borderRadius: 4 },
  activityItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  activityIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#eef2ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  activityText: { flex: 1 },
  activityTitle: { fontWeight: '600', color: '#1e293b', fontSize: 14 },
  activitySubtitle: { color: '#64748b', fontSize: 12, marginTop: 2 },
  
  tablesRowGrid: { gap: 15 },
  tableCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 15, marginBottom: 15 },
  fullPageTable: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 15 },
  
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 10 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitleText: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  tableTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
  viewAllLink: { color: '#4361ee', fontWeight: '600' },
  primaryButton: { backgroundColor: '#4361ee', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, gap: 6 },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  
  tableHeaderRow: { flexDirection: 'row', backgroundColor: '#f8fafc', paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 2, borderBottomColor: '#e2e8f0' },
  headerCell: { fontWeight: 'bold', color: '#475569', fontSize: 13 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  cell: { fontSize: 13, color: '#334155' },
  boldCell: { fontWeight: '600', color: '#1e293b' },
  
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 180 },
  userCode: { color: '#64748b', fontSize: 12, width: 60 },
  userNameText: { fontWeight: '600', color: '#1e293b', fontSize: 14, width: 110 },
  userBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 100 },
  roleText: { fontSize: 12, fontWeight: '500' },
  instructorText: { color: '#4361ee' },
  studentText: { color: '#10b981' },
  gpaText: { fontSize: 12, fontWeight: '600', width: 50 },
  
  courseInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 220 },
  courseCodeText: { color: '#64748b', fontSize: 12, width: 60 },
  courseNameText: { fontWeight: '600', color: '#1e293b', fontSize: 14, width: 150 },
  instructorName: { color: '#475569', fontSize: 13, width: 150 },
  
  roleBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4, alignSelf: 'flex-start' },
  instructorBadge: { backgroundColor: '#4361ee' },
  studentBadge: { backgroundColor: '#10b981' },
  roleBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  dayBadge: { backgroundColor: '#eef2ff', color: '#4361ee', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, fontSize: 11, fontWeight: '600', alignSelf: 'flex-start' },
  gpaValue: { fontWeight: '600', fontSize: 12 },
  rowActions: { flexDirection: 'row', gap: 12, marginLeft: 'auto' },
  actionIcon: { padding: 4 },
  mutedText: { color: '#94a3b8', fontSize: 12 },
  
  developmentContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  developmentText: { color: '#94a3b8', fontSize: 16, marginTop: 15 },
  
  passwordFloatingButton: { position: 'absolute', bottom: 20, right: 20, backgroundColor: '#4361ee', padding: 15, borderRadius: 30, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, zIndex: 100 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 15 },
  modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 20, maxHeight: '85%' },
  smallModal: { maxHeight: '60%' },
  viewModal: { maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  modalSubtitle: { fontSize: 16, color: '#64748b', marginBottom: 15, textAlign: 'center' },
  viewContent: { marginBottom: 20 },
  viewBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#eef2ff', marginBottom: 15, gap: 6 },
  viewBadgeText: { color: '#4361ee', fontWeight: '600', fontSize: 13 },
  viewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },
  viewItem: { width: '48%' },
  viewItemFull: { width: '100%' },
  viewLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  viewLabelText: { color: '#64748b', fontSize: 12, fontWeight: '500' },
  viewValue: { color: '#1e293b', fontSize: 14, fontWeight: '500', paddingLeft: 22 },
  idValue: { color: '#4361ee', fontWeight: '600' },
  formGroup: { marginBottom: 15 },
  formGroupSingle: { marginBottom: 15 },
  label: { fontWeight: '600', color: '#475569', marginBottom: 6 },
  labelWithIcon: { flexDirection: 'row', alignItems: 'center' },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, marginBottom: 8, color: '#1e293b', fontSize: 14 },
  disabledInput: { backgroundColor: '#f1f5f9', color: '#94a3b8' },
  hintText: { color: '#94a3b8', fontSize: 11, marginTop: -5, marginBottom: 10 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15 },
  daysScroll: { marginBottom: 15 },
  chip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#4361ee', borderColor: '#4361ee' },
  chipText: { color: '#64748b', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '500' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20, gap: 10 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#f1f5f9', flex: 1, alignItems: 'center' },
  cancelText: { color: '#64748b', fontWeight: 'bold' },
  submitBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#4361ee', flex: 1, alignItems: 'center' },
  successBtn: { backgroundColor: '#4caf50' },
  submitText: { color: '#fff', fontWeight: 'bold' },
  pickerButton: { padding: 15, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#4361ee', borderRadius: 10, marginBottom: 15 },
  pickerItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  coursePickerItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  coursePickerCode: { fontSize: 14, fontWeight: 'bold', color: '#4361ee' },
  messageItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  messageItemUnread: { backgroundColor: '#eef2ff', borderColor: '#bfdbfe' },
  messageAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#4361ee', alignItems: 'center', justifyContent: 'center' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4361ee' },
  messageDetailBox: { backgroundColor: '#f8fafc', padding: 15, borderRadius: 12, marginTop: 10 },
  emptyText: { textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: 20 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  statCard: { width: '48%', backgroundColor: '#fff', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
  statLabel: { color: '#64748b', fontSize: 12, marginBottom: 5 },
  statValue: { fontSize: 24, fontWeight: 'bold' },
  statSmallLabel: { fontSize: 11, marginTop: 5 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  attendanceCodeBox: { backgroundColor: '#eef2ff', padding: 20, borderRadius: 15, marginVertical: 15 },
  attendanceCodeText: { fontSize: 32, fontWeight: 'bold', color: '#4361ee', textAlign: 'center', letterSpacing: 5 },
  startAttendanceBtn: { backgroundColor: '#10b981', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8, alignSelf: 'flex-start', marginTop: 10 },
  startAttendanceText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  
  // 🔴 Styles الجديدة للـ Attendance في الـ Courses
  todayAttendanceRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  presentBadge: { backgroundColor: '#d1fae5', color: '#059669', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, fontSize: 10, fontWeight: 'bold' },
  lateBadge: { backgroundColor: '#fef3c7', color: '#d97706', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, fontSize: 10, fontWeight: 'bold' },
  absentBadge: { backgroundColor: '#fee2e2', color: '#dc2626', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, fontSize: 10, fontWeight: 'bold' },
  miniAttendanceBar: { width: '100%', height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, marginTop: 4 },
  miniAttendanceFill: { height: '100%', borderRadius: 2 },
});