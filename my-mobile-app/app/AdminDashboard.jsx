import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  TextInput, Modal, Alert, Platform, StatusBar, SafeAreaView, Image 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router'; 
import axios from 'axios';
import { auth, db } from './firebase'; 
import { collection, onSnapshot, query, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';

export default function AdminDashboard() {
  const router = useRouter(); 
  
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [alerts, setAlerts] = useState([
    { id: 1, type: 'info', message: 'System update scheduled for tonight', time: '2 hours ago' },
    { id: 2, type: 'warning', message: 'High server load detected', time: '5 hours ago' }
  ]);
  const [departments, setDepartments] = useState([
    { name: 'Computer Science', count: 120, color: '#4361ee' },
    { name: 'Information Systems', count: 85, color: '#4caf50' }
  ]);

  const [adminData, setAdminData] = useState({ name: 'Admin...', code: 'Code...' });
  const [adminProfileImage, setAdminProfileImage] = useState(null);

  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);

  const [selectedItem, setSelectedItem] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editInputValue, setEditInputValue] = useState('');

  const [newUserData, setNewUserData] = useState({
    fullName: '', email: '', password: '', role: 'Student',
    academicYear: '', code: '', department: '', phoneNumber: ''
  });

  const [newCourseData, setNewCourseData] = useState({
    courseId: '', courseName: '', instructorName: '',
    SelectDays: 'Monday', Time: '', RoomNumber: '', capacity: ''
  });

  useEffect(() => {
    const loadSavedImage = async () => {
      const savedImage = await AsyncStorage.getItem('admin_profile_image');
      if (savedImage) setAdminProfileImage(savedImage);
    };
    loadSavedImage();
  }, []);

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
    const q = query(collection(db, "courses"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const coursesArray = [];
      querySnapshot.forEach((document) => {
        coursesArray.push({ id: document.id, ...document.data() });
      });
      setCourses(coursesArray);
    });
    return () => unsubscribe();
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
            setAdminData({
              name: data.fullName || "System Admin",
              code: data.code || "No Code"
            });
          }
        } catch (error) {
          console.error("Error fetching admin data:", error);
        }
      }
    });
    return () => unsubscribe();
  }, [router]);

  const totalStudents = departments.length > 0 
    ? departments.reduce((sum, dept) => sum + dept.count, 0) 
    : 1;

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
      setAdminProfileImage(uri);
      await AsyncStorage.setItem('admin_profile_image', uri);
    }
  };

  const removeProfileImage = async () => {
    setAdminProfileImage(null);
    await AsyncStorage.removeItem('admin_profile_image');
  };

  const handleLogout = () => {
    Alert.alert(
      "تسجيل الخروج",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Logout", 
          style: "destructive", 
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('token'); 
              router.replace('/'); 
            } catch (error) {
              console.error("Error logging out:", error);
            }
          } 
        }
      ]
    );
  };

  const handleAddUserSubmit = async () => {
    const hasEmptyField = Object.values(newUserData).some(value => typeof value === 'string' && value.trim() === "");
    if (hasEmptyField) {
      Alert.alert("تنبيه", "Please fill in all fields.");
      return;
    }
    try {
      const response = await axios.post('http://192.168.1.103:3001/admin/add-user', newUserData);
      if (response.data.success) {
        Alert.alert("نجاح", "User added successfully!");
        setIsAddUserModalOpen(false);
        setNewUserData({
          fullName: '', email: '', password: '', role: 'Student',
          academicYear: '', department: '', phoneNumber: '', code: '' 
        });
      }
    } catch (error) {
      console.error("Error adding user:", error);
      Alert.alert("خطأ", error.response?.data?.error || "Something went wrong");
    }
  };

  const handleAddCourseSubmit = async () => {
    const isFormValid = Object.values(newCourseData).every(value => typeof value === 'string' && value.trim() !== "");
    if (!isFormValid) {
      Alert.alert("تنبيه", "Please fill in all fields.");
      return;
    }
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.post('http://192.168.1.103:3001/admin/add-course', newCourseData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        Alert.alert("نجاح", "Course added successfully!");
        setIsAddCourseModalOpen(false);
        setNewCourseData({
          courseId: '', courseName: '', instructorName: '',
          SelectDays: 'Monday', Time: '', RoomNumber: '', capacity: ''
        });
      }
    } catch (error) {
      console.error("Error adding course:", error);
      Alert.alert("خطأ", error.response?.data?.error || "Failed to add course.");
    }
  };

  const handleDelete = (collectionName, id) => {
    Alert.alert(
      "تأكيد الحذف",
      "Are you sure you want to delete this?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              await deleteDoc(doc(db, collectionName, id));
              Alert.alert("نجاح", "Deleted successfully from Database!");
            } catch (error) {
              console.error("Firebase Delete Error:", error);
              Alert.alert("خطأ", "Failed to delete from Database");
            }
          } 
        }
      ]
    );
  };

  const handleView = (item) => {
    setSelectedItem(item);
    setIsViewModalOpen(true);
  };

  const handleChange = (item) => {
    setSelectedItem(item);
    setEditInputValue(item.department || item.RoomNumber || item.time || "");
    setIsEditModalOpen(true);
  };

  const handleSaveChanges = async () => {
    if (!editInputValue.trim()) {
      Alert.alert("تنبيه", "Field cannot be empty!");
      return;
    }
    try {
      const isCourse = !!selectedItem.courseName; 
      const collectionName = isCourse ? "courses" : "users";
      const itemRef = doc(db, collectionName, selectedItem.id);

      const updatedData = isCourse 
        ? { RoomNumber: editInputValue } 
        : { department: editInputValue };

      await updateDoc(itemRef, updatedData);
      Alert.alert("نجاح", "Updated successfully!");
      setIsEditModalOpen(false);
    } catch (error) {
      Alert.alert("خطأ", error.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{adminData.name}</Text>
          <Text style={styles.headerSubtitle}>ID: {adminData.code}</Text>
          {adminProfileImage && (
            <TouchableOpacity onPress={removeProfileImage}>
              <Text style={styles.removeText}>Remove Photo</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={handleImageUpload}>
          {adminProfileImage ? (
            <Image source={{ uri: adminProfileImage }} style={styles.userAvatarImage} />
          ) : (
            <View style={styles.userAvatar}>
              <Text style={styles.avatarText}>
                 {adminData.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
              </Text>
              <View style={styles.addPhotoBadge}><Text style={styles.addPhotoText}>+</Text></View>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topNav} contentContainerStyle={styles.topNavContent}>
        <TouchableOpacity style={styles.navItemActive}><Text style={styles.navTextActive}>Dashboard</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem}><Text style={styles.navText}>All Users</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem}><Text style={styles.navText}>Courses</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItemLogout} onPress={handleLogout}>
          <Text style={styles.navTextLogout}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false}>
        
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#4361ee'}]} onPress={() => setIsAddCourseModalOpen(true)}>
            <Feather name="book-open" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Add Course</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#10b981'}]} onPress={() => setIsAddUserModalOpen(true)}>
            <Feather name="user-plus" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Add User</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Students by Department</Text>
          {departments.map((dept, idx) => (
            <View key={idx} style={styles.deptRow}>
              <View style={styles.deptHeader}>
                <Text style={styles.deptName}>{dept.name}</Text>
                <Text style={styles.deptCount}>{dept.count}</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${(dept.count / totalStudents) * 100}%`, backgroundColor: dept.color }]} />
              </View>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Users</Text>
          <TouchableOpacity onPress={() => setIsAddUserModalOpen(true)}><Text style={styles.linkText}>View All</Text></TouchableOpacity>
        </View>
        
        {users.length === 0 ? (
          <Text style={styles.emptyText}>No users found in database.</Text>
        ) : (
          users.slice(0, 5).map(user => (
            <View key={user.id} style={styles.userCard}>
              <View style={styles.userCardLeft}>
                <View style={styles.userIcon}><Feather name="user" size={20} color="#4361ee" /></View>
                <View>
                  <Text style={styles.userName}>{user.fullName || user.name || "N/A"}</Text>
                  <Text style={styles.userRole}>{user.role} • {user.department || "General"}</Text>
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => handleView(user)}><Feather name="eye" size={18} color="#2196f3" /></TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => handleChange(user)}><Feather name="edit-2" size={18} color="#4caf50" /></TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete("users", user.id)}><Feather name="trash-2" size={18} color="#ef4444" /></TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Courses</Text>
        </View>

        {courses.length === 0 ? (
          <Text style={styles.emptyText}>No courses found in database.</Text>
        ) : (
          courses.slice(0, 5).map(course => (
            <View key={course.id} style={styles.courseCard}>
              <View style={styles.courseHeader}>
                <Text style={styles.courseCode}>{course.courseId || "N/A"}</Text>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => handleView(course)}><Feather name="eye" size={18} color="#2196f3" /></TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => handleChange(course)}><Feather name="edit-2" size={18} color="#4caf50" /></TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete("courses", course.id)}><Feather name="trash-2" size={18} color="#ef4444" /></TouchableOpacity>
                </View>
              </View>
              <Text style={styles.courseName}>{course.courseName || "Unknown Course"}</Text>
              <Text style={styles.courseInstructor}><Feather name="user" size={12}/> {course.instructorName || "No Instructor"}</Text>
              <Text style={styles.courseMeta}><Feather name="calendar" size={12}/> {course.SelectDays || course.days || "TBD"} • <Feather name="clock" size={12}/> {course.Time || course.time || "TBD"}</Text>
            </View>
          ))
        )}

        <View style={{height: 50}} />
      </ScrollView>

      <Modal visible={isViewModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, {color: '#4361ee', borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 10}]}>Item Details</Text>
            {selectedItem && (
              <View style={{marginTop: 10}}>
                <Text style={styles.viewText}><Text style={styles.boldText}>Name:</Text> {selectedItem.fullName || selectedItem.courseName || selectedItem.name || "N/A"}</Text>
                <Text style={styles.viewText}><Text style={styles.boldText}>ID:</Text> {selectedItem.code || selectedItem.courseId || selectedItem.id || "N/A"}</Text>
                <Text style={styles.viewText}><Text style={styles.boldText}>Role/Instructor:</Text> {selectedItem.role || selectedItem.instructorName || "N/A"}</Text>
                <Text style={styles.viewText}><Text style={styles.boldText}>Department:</Text> {selectedItem.department || selectedItem.RoomNumber || "General"}</Text>
                {selectedItem.courseName && (
                  <Text style={styles.viewText}><Text style={styles.boldText}>Schedule:</Text> {selectedItem.SelectDays || selectedItem.days} at {selectedItem.Time || selectedItem.time}</Text>
                )}
                <Text style={styles.viewText}><Text style={styles.boldText}>Status:</Text> <Text style={{color: '#4caf50'}}>{selectedItem.status || 'Active'}</Text></Text>
              </View>
            )}
            <TouchableOpacity style={[styles.submitBtn, {marginTop: 20, backgroundColor: '#333'}]} onPress={() => setIsViewModalOpen(false)}>
              <Text style={[styles.submitText, {textAlign: 'center'}]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isEditModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, {color: '#4caf50'}]}>Update Details</Text>
            {selectedItem && (
              <View>
                <Text style={styles.label}>Name (Read Only):</Text>
                <TextInput 
                  style={[styles.input, {backgroundColor: '#f1f5f9', color: '#94a3b8'}]} 
                  value={selectedItem.fullName || selectedItem.courseName || ''} 
                  editable={false} 
                />
                
                <Text style={styles.label}>New {selectedItem.courseName ? 'Room Number' : 'Department'}:</Text>
                <TextInput 
                  style={styles.input} 
                  value={editInputValue} 
                  onChangeText={setEditInputValue} 
                  placeholder="Enter new value"
                />

                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditModalOpen(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.submitBtn, {backgroundColor: '#4caf50'}]} onPress={handleSaveChanges}>
                    <Text style={styles.submitText}>Update Now</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={isAddUserModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New User</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput style={styles.input} placeholder="Full Name" value={newUserData.fullName} onChangeText={t => setNewUserData({...newUserData, fullName: t})} />
              <TextInput style={styles.input} placeholder="Email" value={newUserData.email} onChangeText={t => setNewUserData({...newUserData, email: t})} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={styles.input} placeholder="Password" value={newUserData.password} onChangeText={t => setNewUserData({...newUserData, password: t})} secureTextEntry />
              
              <Text style={styles.label}>Select Role:</Text>
              <View style={styles.chipsRow}>
                {['Student', 'Instructor', 'Admin'].map(role => (
                  <TouchableOpacity key={role} onPress={() => setNewUserData({...newUserData, role})} style={[styles.chip, newUserData.role === role && styles.chipActive]}>
                    <Text style={[styles.chipText, newUserData.role === role && styles.chipTextActive]}>{role}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput style={styles.input} placeholder="Department" value={newUserData.department} onChangeText={t => setNewUserData({...newUserData, department: t})} />
              <TextInput style={styles.input} placeholder="Academic Year (e.g., 2024)" value={newUserData.academicYear} onChangeText={t => setNewUserData({...newUserData, academicYear: t})} keyboardType="numeric" />
              <TextInput style={styles.input} placeholder="Student/Staff Code" value={newUserData.code} onChangeText={t => setNewUserData({...newUserData, code: t})} />
              <TextInput style={styles.input} placeholder="Phone Number" value={newUserData.phoneNumber} onChangeText={t => setNewUserData({...newUserData, phoneNumber: t})} keyboardType="phone-pad" />
              
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsAddUserModalOpen(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} onPress={handleAddUserSubmit}>
                  <Text style={styles.submitText}>Save User</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={isAddCourseModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Course</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput style={styles.input} placeholder="Course ID (e.g., CS404)" value={newCourseData.courseId} onChangeText={t => setNewCourseData({...newCourseData, courseId: t})} />
              <TextInput style={styles.input} placeholder="Course Name" value={newCourseData.courseName} onChangeText={t => setNewCourseData({...newCourseData, courseName: t})} />
              <TextInput style={styles.input} placeholder="Instructor Name" value={newCourseData.instructorName} onChangeText={t => setNewCourseData({...newCourseData, instructorName: t})} />
              
              <Text style={styles.label}>Select Day:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 15}}>
                {['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'].map(day => (
                  <TouchableOpacity key={day} onPress={() => setNewCourseData({...newCourseData, SelectDays: day})} style={[styles.chip, newCourseData.SelectDays === day && styles.chipActive]}>
                    <Text style={[styles.chipText, newCourseData.SelectDays === day && styles.chipTextActive]}>{day}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextInput style={styles.input} placeholder="Time (e.g., 1:00 PM)" value={newCourseData.Time} onChangeText={t => setNewCourseData({...newCourseData, Time: t})} />
              <TextInput style={styles.input} placeholder="Room Number" value={newCourseData.RoomNumber} onChangeText={t => setNewCourseData({...newCourseData, RoomNumber: t})} />
              <TextInput style={styles.input} placeholder="Capacity" value={newCourseData.capacity} onChangeText={t => setNewCourseData({...newCourseData, capacity: t})} keyboardType="numeric" />
              
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsAddCourseModalOpen(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} onPress={handleAddCourseSubmit}>
                  <Text style={styles.submitText}>Save Course</Text>
                </TouchableOpacity>
              </View>
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 40) + 15 : 45 
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  headerSubtitle: { color: '#64748b', fontSize: 13, fontWeight: '600', marginTop: 2 },
  headerTitle: { color: '#1e293b', fontSize: 20, fontWeight: 'bold' },
  userAvatar: { backgroundColor: '#4361ee', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  userAvatarImage: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: '#4361ee' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  addPhotoBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#10b981', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  addPhotoText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  removeText: { color: '#ef4444', fontSize: 12, marginTop: 5, fontWeight: 'bold' },

  topNav: { 
    backgroundColor: '#fff', 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderColor: '#e2e8f0',
    minHeight: 60,
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

  mainContent: { padding: 15 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 10, marginTop: 10 },
  linkText: { color: '#4361ee', fontWeight: '600' },

  quickActionsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  actionBtn: { width: '48%', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 2 },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  card: { backgroundColor: '#fff', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 15 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 15 },
  deptRow: { marginBottom: 15 },
  deptHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  deptName: { color: '#475569', fontWeight: '500' },
  deptCount: { fontWeight: 'bold', color: '#1e293b' },
  progressBarBg: { height: 8, backgroundColor: '#f1f5f9', borderRadius: 4 },
  progressBarFill: { height: '100%', borderRadius: 4 },

  userCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  userCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  userIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  userName: { fontWeight: 'bold', color: '#1e293b', fontSize: 15 },
  userRole: { color: '#64748b', fontSize: 13, marginTop: 2 },
  
  courseCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderLeftColor: '#4361ee' },
  courseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  courseCode: { color: '#4361ee', fontWeight: 'bold', fontSize: 13 },
  courseName: { fontWeight: 'bold', color: '#1e293b', fontSize: 16, marginBottom: 5 },
  courseInstructor: { color: '#475569', fontSize: 13, marginBottom: 3 },
  courseMeta: { color: '#64748b', fontSize: 12 },

  cardActions: { flexDirection: 'row', gap: 15 },
  iconBtn: { padding: 4 },
  emptyText: { textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 15 },
  modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b', marginBottom: 15 },
  
  viewText: { fontSize: 15, color: '#334155', marginBottom: 8, lineHeight: 22 },
  boldText: { fontWeight: 'bold', color: '#1e293b' },

  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, marginBottom: 12, color: '#1e293b' },
  label: { fontWeight: 'bold', color: '#475569', marginBottom: 8, marginTop: 5 },
  
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15 },
  chip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#4361ee', borderColor: '#4361ee' },
  chipText: { color: '#64748b', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '500' },

  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 10 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#f1f5f9', flex: 1, alignItems: 'center' },
  cancelText: { color: '#64748b', fontWeight: 'bold' },
  submitBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#4361ee', flex: 1, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: 'bold' }
});