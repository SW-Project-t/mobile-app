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
import { onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';

export default function AdminDashboard() {
  const router = useRouter(); 
  
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  const [adminData, setAdminData] = useState({ name: 'System Admin', code: 'ADM-001' });
  const [adminProfileImage, setAdminProfileImage] = useState(null);

  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const [newUserData, setNewUserData] = useState({
    fullName: '', email: '', password: '', role: '',
    academicYear: '', code: '', department: '', phoneNumber: '',
    gpa: ''
  });

  const [newCourseData, setNewCourseData] = useState({
    courseId: '', courseName: '', instructorName: '',
    SelectDays: '', Time: '', RoomNumber: '', capacity: '', totalStudents: 0
  });

  const [passwordFields, setPasswordFields] = useState({
    currentPassword: '', newPassword: '', confirmPassword: ''
  });

  const [editFieldValue, setEditFieldValue] = useState('');
  const [editGpaValue, setEditGpaValue] = useState('');

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
      
      const deptMap = {};
      usersArray.forEach(u => {
        const d = u.department || 'General';
        deptMap[d] = (deptMap[d] || 0) + 1;
      });
      const deptList = Object.keys(deptMap).map(k => ({ name: k, count: deptMap[k] }));
      setDepartments(deptList);
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
              code: data.code || "ADM-001"
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

  const filteredUsers = users.filter(u => 
    u.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCourses = courses.filter(c => 
    c.courseName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.courseId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  const handleAddUserSubmit = async () => {
    const requiredFields = ['fullName', 'email', 'password', 'role', 'phoneNumber'];
    const hasEmptyRequired = requiredFields.some(field => !newUserData[field]?.trim());
    
    if (hasEmptyRequired) {
      Alert.alert("تنبيه", "Please fill in all required fields.");
      return;
    }

    if (newUserData.role === 'student') {
      if (!newUserData.gpa) {
        Alert.alert("تنبيه", "GPA is required for students");
        return;
      }
      const gpa = parseFloat(newUserData.gpa);
      if (gpa < 0 || gpa > 4) {
        Alert.alert("تنبيه", "GPA must be between 0 and 4");
        return;
      }
    }

    try {
      const response = await axios.post('http://192.168.1.103:3001/admin/add-user', newUserData);
      if (response.data.success) {
        Alert.alert("نجاح", "User added successfully!");
        setIsAddUserModalOpen(false);
        setNewUserData({
          fullName: '', email: '', password: '', role: '',
          academicYear: '', department: '', phoneNumber: '', code: '',
          gpa: ''
        });
      }
    } catch (error) {
      Alert.alert("خطأ", error.response?.data?.error || "Something went wrong");
    }
  };

  const handleAddCourseSubmit = async () => {
    const isFormValid = Object.values(newCourseData).every(value => 
      typeof value === 'string' ? value.trim() !== "" : true
    );
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
          SelectDays: '', Time: '', RoomNumber: '', capacity: '', totalStudents: 0
        });
      }
    } catch (error) {
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
              Alert.alert("نجاح", "Deleted successfully!");
            } catch (error) {
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

  const handleEdit = (item) => {
    setSelectedItem(item);
    setEditFieldValue(item.department || item.RoomNumber || "");
    setEditGpaValue(item.gpa || "");
    setIsEditModalOpen(true);
  };

  const handleSaveChanges = async () => {
    if (!editFieldValue.trim() && !selectedItem.courseName) {
      Alert.alert("تنبيه", "Field cannot be empty!");
      return;
    }
    
    try {
      const collectionName = selectedItem.courseName ? "courses" : "users";
      const itemRef = doc(db, collectionName, selectedItem.id);
      
      let updatedData = {};
      if (selectedItem.courseName) {
        updatedData = { 
          courseName: selectedItem.courseName,
          courseId: selectedItem.courseId,
          instructorName: selectedItem.instructorName,
          SelectDays: selectedItem.SelectDays,
          Time: selectedItem.Time,
          RoomNumber: editFieldValue || selectedItem.RoomNumber,
          capacity: selectedItem.capacity
        };
      } else {
        updatedData = { 
          fullName: selectedItem.fullName,
          email: selectedItem.email,
          role: selectedItem.role,
          department: editFieldValue || selectedItem.department,
          code: selectedItem.code,
          phoneNumber: selectedItem.phoneNumber,
          academicYear: selectedItem.academicYear,
        };
        
        if (selectedItem.role === 'student' && editGpaValue) {
          const gpa = parseFloat(editGpaValue);
          if (gpa < 0 || gpa > 4) {
            Alert.alert("تنبيه", "GPA must be between 0 and 4");
            return;
          }
          updatedData.gpa = editGpaValue;
        } else if (selectedItem.role === 'student' && selectedItem.gpa) {
          updatedData.gpa = selectedItem.gpa;
        }
      }
      
      await updateDoc(itemRef, updatedData);
      Alert.alert("نجاح", "Updated successfully!");
      setIsEditModalOpen(false);
    } catch (error) {
      Alert.alert("خطأ", error.message);
    }
  };

  const handlePasswordUpdate = async () => {
    const user = auth.currentUser;
    if (passwordFields.newPassword !== passwordFields.confirmPassword) {
      Alert.alert("خطأ", "New passwords do not match!");
      return;
    }
    try {
      const credential = EmailAuthProvider.credential(user.email, passwordFields.currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwordFields.newPassword);
      Alert.alert("نجاح", "Password updated successfully!");
      setIsPasswordModalOpen(false);
      setPasswordFields({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      Alert.alert("خطأ", "Check your current password.");
    }
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

  const getRoleIcon = (role) => {
    switch(role) {
      case 'instructor': return "user-check";
      case 'student': return "graduation-cap";
      default: return "users";
    }
  };

  const getGpaColor = (gpa) => {
    if (!gpa) return '#a0aec0';
    const numGpa = parseFloat(gpa);
    if (numGpa >= 3.5) return '#48bb78';
    if (numGpa >= 2.5) return '#ecc94b';
    if (numGpa >= 2.0) return '#f56565';
    return '#ef4444';
  };

  const renderDashboard = () => (
    <View>
      <View style={styles.quickActionsGrid}>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#4361ee'}]} onPress={() => setIsAddCourseModalOpen(true)}>
          <Feather name="book-open" size={20} color="#fff" />
          <Text style={styles.actionBtnText}>New Course</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#10b981'}]} onPress={() => setIsAddUserModalOpen(true)}>
          <Feather name="user-plus" size={20} color="#fff" />
          <Text style={styles.actionBtnText}>New User</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#f59e0b'}]} onPress={() => setActiveTab('Analytics')}>
          <Feather name="download" size={20} color="#fff" />
          <Text style={styles.actionBtnText}>Reports</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#ef4444'}]} onPress={() => setActiveTab('Settings')}>
          <Feather name="shield" size={20} color="#fff" />
          <Text style={styles.actionBtnText}>Settings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.middleRowGrid}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="grid" size={20} color="#4361ee" />
            <Text style={styles.cardTitle}>Students by Department</Text>
          </View>
          {departments.length === 0 ? (
            <Text style={styles.emptyText}>No data available</Text>
          ) : (
            departments.map(dept => (
              <View style={styles.deptRow} key={dept.name}>
                <View style={styles.deptHeader}>
                  <Text style={styles.deptName}>{dept.name}</Text>
                  <Text style={styles.deptCount}>{dept.count} Users</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${(dept.count / totalStudents) * 100}%`, backgroundColor: '#4361ee' }]} />
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="bell" size={20} color="#4361ee" />
            <Text style={styles.cardTitle}>Recent Activities</Text>
          </View>
          {courses.slice(0, 3).length === 0 ? (
            <Text style={styles.emptyText}>No recent activities</Text>
          ) : (
            courses.slice(0, 3).map((act, i) => (
              <View style={styles.activityItem} key={i}>
                <View style={styles.activityIcon}>
                  <Feather name="plus" size={16} color="#4361ee" />
                </View>
                <View style={styles.activityText}>
                  <Text style={styles.activityTitle}>New course added</Text>
                  <Text style={styles.activitySubtitle}>{act.courseName}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.tablesRowGrid}>
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableTitle}>Recent Users</Text>
            <TouchableOpacity onPress={() => setActiveTab('All Users')}>
              <Text style={styles.viewAllLink}>View All</Text>
            </TouchableOpacity>
          </View>
          {filteredUsers.slice(0, 4).length === 0 ? (
            <Text style={styles.emptyText}>No data</Text>
          ) : (
            filteredUsers.slice(0, 4).map(u => (
              <View key={u.id} style={styles.tableRow}>
                <View style={styles.userInfo}>
                  <Text style={styles.userCode}>{u.code || '---'}</Text>
                  <Text style={styles.userNameText}>{u.fullName}</Text>
                </View>
                <View style={styles.userBadge}>
                  <Feather name={getRoleIcon(u.role)} size={12} color={u.role === 'instructor' ? '#4361ee' : '#10b981'} />
                  <Text style={[styles.roleText, u.role === 'instructor' ? styles.instructorText : styles.studentText]}>
                    {u.role || 'Student'}
                  </Text>
                </View>
                {u.role === 'student' && u.gpa && (
                  <Text style={[styles.gpaText, { color: getGpaColor(u.gpa) }]}>
                    <Feather name="star" size={12} /> {u.gpa}
                  </Text>
                )}
                <View style={styles.rowActions}>
                  <TouchableOpacity onPress={() => handleView(u)} style={styles.actionIcon}>
                    <Feather name="eye" size={16} color="#2196f3" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleEdit(u)} style={styles.actionIcon}>
                    <Feather name="edit-2" size={16} color="#4caf50" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete('users', u.id)} style={styles.actionIcon}>
                    <Feather name="trash-2" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableTitle}>Recent Courses</Text>
            <TouchableOpacity onPress={() => setActiveTab('Courses')}>
              <Text style={styles.viewAllLink}>View All</Text>
            </TouchableOpacity>
          </View>
          {filteredCourses.slice(0, 4).length === 0 ? (
            <Text style={styles.emptyText}>No data</Text>
          ) : (
            filteredCourses.slice(0, 4).map(c => (
              <View key={c.id} style={styles.tableRow}>
                <View style={styles.courseInfo}>
                  <Text style={styles.courseCodeText}>{c.courseId}</Text>
                  <Text style={styles.courseNameText}>{c.courseName}</Text>
                </View>
                <Text style={styles.instructorName}>{c.instructorName}</Text>
                <View style={styles.rowActions}>
                  <TouchableOpacity onPress={() => handleView(c)} style={styles.actionIcon}>
                    <Feather name="eye" size={16} color="#2196f3" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleEdit(c)} style={styles.actionIcon}>
                    <Feather name="edit-2" size={16} color="#4caf50" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete('courses', c.id)} style={styles.actionIcon}>
                    <Feather name="trash-2" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    </View>
  );

  const renderAllUsers = () => (
    <View style={styles.fullPageTable}>
      <View style={styles.tableHeader}>
        <View style={styles.headerTitle}>
          <Feather name="users" size={24} color="#4361ee" />
          <Text style={styles.headerTitleText}>User Management ({filteredUsers.length})</Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setIsAddUserModalOpen(true)}>
          <Feather name="plus" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Add User</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.headerCell, { width: 80 }]}>ID</Text>
            <Text style={[styles.headerCell, { width: 150 }]}>Full Name</Text>
            <Text style={[styles.headerCell, { width: 180 }]}>Email</Text>
            <Text style={[styles.headerCell, { width: 100 }]}>Role</Text>
            <Text style={[styles.headerCell, { width: 120 }]}>Department</Text>
            <Text style={[styles.headerCell, { width: 80 }]}>GPA</Text>
            <Text style={[styles.headerCell, { width: 120 }]}>Phone</Text>
            <Text style={[styles.headerCell, { width: 120 }]}>Actions</Text>
          </View>

          {filteredUsers.length === 0 ? (
            <Text style={styles.emptyText}>No data</Text>
          ) : (
            filteredUsers.map(u => (
              <View key={u.id} style={styles.tableRow}>
                <Text style={[styles.cell, { width: 80 }]}>{u.code || '---'}</Text>
                <Text style={[styles.cell, styles.boldCell, { width: 150 }]}>{u.fullName}</Text>
                <Text style={[styles.cell, { width: 180 }]}>{u.email}</Text>
                <View style={[styles.cell, { width: 100 }]}>
                  <View style={[styles.roleBadge, u.role === 'instructor' ? styles.instructorBadge : styles.studentBadge]}>
                    <Feather name={getRoleIcon(u.role)} size={12} color="#fff" />
                    <Text style={styles.roleBadgeText}>{u.role || 'Student'}</Text>
                  </View>
                </View>
                <Text style={[styles.cell, { width: 120 }]}>{u.department || 'General'}</Text>
                <View style={[styles.cell, { width: 80 }]}>
                  {u.role === 'student' ? (
                    u.gpa ? (
                      <Text style={[styles.gpaValue, { color: getGpaColor(u.gpa) }]}>
                        <Feather name="star" size={12} /> {u.gpa}
                      </Text>
                    ) : (
                      <Text style={styles.mutedText}>Not set</Text>
                    )
                  ) : (
                    <Text style={styles.mutedText}>---</Text>
                  )}
                </View>
                <Text style={[styles.cell, { width: 120 }]}>{u.phoneNumber}</Text>
                <View style={[styles.cell, { width: 120, flexDirection: 'row' }]}>
                  <TouchableOpacity onPress={() => handleView(u)} style={styles.actionIcon}>
                    <Feather name="eye" size={18} color="#2196f3" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleEdit(u)} style={styles.actionIcon}>
                    <Feather name="edit-2" size={18} color="#4caf50" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete('users', u.id)} style={styles.actionIcon}>
                    <Feather name="trash-2" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );

  const renderCourses = () => (
    <View style={styles.fullPageTable}>
      <View style={styles.tableHeader}>
        <View style={styles.headerTitle}>
          <Feather name="book-open" size={24} color="#4361ee" />
          <Text style={styles.headerTitleText}>Course Management ({filteredCourses.length})</Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setIsAddCourseModalOpen(true)}>
          <Feather name="plus" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Add Course</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.headerCell, { width: 100 }]}>Code</Text>
            <Text style={[styles.headerCell, { width: 200 }]}>Course Name</Text>
            <Text style={[styles.headerCell, { width: 150 }]}>Instructor</Text>
            <Text style={[styles.headerCell, { width: 100 }]}>Days</Text>
            <Text style={[styles.headerCell, { width: 100 }]}>Time</Text>
            <Text style={[styles.headerCell, { width: 100 }]}>Room</Text>
            <Text style={[styles.headerCell, { width: 100 }]}>Capacity</Text>
            <Text style={[styles.headerCell, { width: 120 }]}>Actions</Text>
          </View>

          {filteredCourses.length === 0 ? (
            <Text style={styles.emptyText}>No data</Text>
          ) : (
            filteredCourses.map(c => (
              <View key={c.id} style={styles.tableRow}>
                <Text style={[styles.cell, { width: 100 }]}>{c.courseId}</Text>
                <Text style={[styles.cell, styles.boldCell, { width: 200 }]}>{c.courseName}</Text>
                <Text style={[styles.cell, { width: 150 }]}>{c.instructorName}</Text>
                <View style={[styles.cell, { width: 100 }]}>
                  <Text style={styles.dayBadge}>{c.SelectDays}</Text>
                </View>
                <Text style={[styles.cell, { width: 100 }]}>{c.Time}</Text>
                <Text style={[styles.cell, { width: 100 }]}>{c.RoomNumber}</Text>
                <Text style={[styles.cell, { width: 100 }]}>{c.capacity}</Text>
                <View style={[styles.cell, { width: 120, flexDirection: 'row' }]}>
                  <TouchableOpacity onPress={() => handleView(c)} style={styles.actionIcon}>
                    <Feather name="eye" size={18} color="#2196f3" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleEdit(c)} style={styles.actionIcon}>
                    <Feather name="edit-2" size={18} color="#4caf50" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete('courses', c.id)} style={styles.actionIcon}>
                    <Feather name="trash-2" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );

  const renderUnderDevelopment = () => (
    <View style={styles.developmentContainer}>
      <Feather name="settings" size={60} color="#94a3b8" />
      <Text style={styles.developmentText}>This page is currently under development</Text>
    </View>
  );

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
              <View style={styles.addPhotoBadge}>
                <Text style={styles.addPhotoText}>+</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topNav}>
        <TouchableOpacity 
          style={[styles.navItem, activeTab === 'Dashboard' && styles.navItemActive]} 
          onPress={() => setActiveTab('Dashboard')}
        >
          <Feather name="grid" size={16} color={activeTab === 'Dashboard' ? '#fff' : '#64748b'} />
          <Text style={[styles.navText, activeTab === 'Dashboard' && styles.navTextActive]}>Dashboard</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.navItem, activeTab === 'All Users' && styles.navItemActive]} 
          onPress={() => setActiveTab('All Users')}
        >
          <Feather name="users" size={16} color={activeTab === 'All Users' ? '#fff' : '#64748b'} />
          <Text style={[styles.navText, activeTab === 'All Users' && styles.navTextActive]}>All Users</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.navItem, activeTab === 'Courses' && styles.navItemActive]} 
          onPress={() => setActiveTab('Courses')}
        >
          <Feather name="book-open" size={16} color={activeTab === 'Courses' ? '#fff' : '#64748b'} />
          <Text style={[styles.navText, activeTab === 'Courses' && styles.navTextActive]}>Courses</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.navItem, activeTab === 'Analytics' && styles.navItemActive]} 
          onPress={() => setActiveTab('Analytics')}
        >
          <Feather name="trending-up" size={16} color={activeTab === 'Analytics' ? '#fff' : '#64748b'} />
          <Text style={[styles.navText, activeTab === 'Analytics' && styles.navTextActive]}>Analytics</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.navItem, activeTab === 'Settings' && styles.navItemActive]} 
          onPress={() => setActiveTab('Settings')}
        >
          <Feather name="settings" size={16} color={activeTab === 'Settings' ? '#fff' : '#64748b'} />
          <Text style={[styles.navText, activeTab === 'Settings' && styles.navTextActive]}>Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navItem, styles.navItemLogout]} onPress={handleLogout}>
          <Feather name="log-out" size={16} color="#ef4444" />
          <Text style={styles.navTextLogout}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'Dashboard' && renderDashboard()}
        {activeTab === 'All Users' && renderAllUsers()}
        {activeTab === 'Courses' && renderCourses()}
        {(activeTab === 'Analytics' || activeTab === 'Settings') && renderUnderDevelopment()}
        
        <View style={{height: 30}} />
      </ScrollView>

      {/* Change Password Button - Fixed at bottom */}
      <TouchableOpacity style={styles.passwordFloatingButton} onPress={() => setIsPasswordModalOpen(true)}>
        <Feather name="key" size={20} color="#fff" />
        <Text style={styles.passwordButtonText}>Change Password</Text>
      </TouchableOpacity>

      {/* View Modal */}
      <Modal visible={isViewModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.viewModal]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                {selectedItem?.courseName ? (
                  <Feather name="book-open" size={28} color="#4361ee" />
                ) : selectedItem?.role === 'instructor' ? (
                  <Feather name="user-check" size={28} color="#4361ee" />
                ) : (
                  <Feather name="graduation-cap" size={28} color="#4361ee" />
                )}
                <Text style={styles.modalTitle}>
                  {selectedItem?.courseName ? 'Course Details' : 
                   selectedItem?.role === 'instructor' ? 'Instructor Details' : 'Student Details'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsViewModalOpen(false)}>
                <Feather name="x" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {selectedItem.courseName ? (
                  <View style={styles.viewContent}>
                    <View style={styles.viewBadge}>
                      <Text style={styles.viewBadgeText}>Course</Text>
                    </View>
                    <View style={styles.viewGrid}>
                      <View style={styles.viewItem}>
                        <View style={styles.viewLabel}>
                          <Feather name="book" size={16} color="#4361ee" />
                          <Text style={styles.viewLabelText}>Course Name</Text>
                        </View>
                        <Text style={styles.viewValue}>{selectedItem.courseName}</Text>
                      </View>
                      <View style={styles.viewItem}>
                        <View style={styles.viewLabel}>
                          <Feather name="hash" size={16} color="#4361ee" />
                          <Text style={styles.viewLabelText}>Course Code</Text>
                        </View>
                        <Text style={[styles.viewValue, styles.idValue]}>{selectedItem.courseId}</Text>
                      </View>
                      <View style={styles.viewItem}>
                        <View style={styles.viewLabel}>
                          <Feather name="user-check" size={16} color="#4361ee" />
                          <Text style={styles.viewLabelText}>Instructor</Text>
                        </View>
                        <Text style={styles.viewValue}>{selectedItem.instructorName}</Text>
                      </View>
                      <View style={styles.viewItem}>
                        <View style={styles.viewLabel}>
                          <Feather name="calendar" size={16} color="#4361ee" />
                          <Text style={styles.viewLabelText}>Day</Text>
                        </View>
                        <Text style={styles.viewValue}>{selectedItem.SelectDays}</Text>
                      </View>
                      <View style={styles.viewItem}>
                        <View style={styles.viewLabel}>
                          <Feather name="clock" size={16} color="#4361ee" />
                          <Text style={styles.viewLabelText}>Time</Text>
                        </View>
                        <Text style={styles.viewValue}>{selectedItem.Time}</Text>
                      </View>
                      <View style={styles.viewItem}>
                        <View style={styles.viewLabel}>
                          <Feather name="home" size={16} color="#4361ee" />
                          <Text style={styles.viewLabelText}>Room</Text>
                        </View>
                        <Text style={styles.viewValue}>{selectedItem.RoomNumber}</Text>
                      </View>
                      <View style={[styles.viewItem, styles.viewItemFull]}>
                        <View style={styles.viewLabel}>
                          <Feather name="users" size={16} color="#4361ee" />
                          <Text style={styles.viewLabelText}>Capacity</Text>
                        </View>
                        <Text style={styles.viewValue}>{selectedItem.capacity} Students</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.viewContent}>
                    <View style={[styles.viewBadge, selectedItem.role === 'instructor' ? styles.instructorBadge : styles.studentBadge]}>
                      <Feather name={selectedItem.role === 'instructor' ? 'user-check' : 'graduation-cap'} size={14} color="#fff" />
                      <Text style={styles.viewBadgeText}>
                        {selectedItem.role === 'instructor' ? 'Instructor' : 'Student'}
                      </Text>
                    </View>
                    <View style={styles.viewGrid}>
                      <View style={[styles.viewItem, styles.viewItemFull]}>
                        <View style={styles.viewLabel}>
                          <Feather name="user" size={16} color="#4361ee" />
                          <Text style={styles.viewLabelText}>Full Name</Text>
                        </View>
                        <Text style={styles.viewValue}>{selectedItem.fullName}</Text>
                      </View>
                      <View style={styles.viewItem}>
                        <View style={styles.viewLabel}>
                          <Feather name="mail" size={16} color="#4361ee" />
                          <Text style={styles.viewLabelText}>Email</Text>
                        </View>
                        <Text style={styles.viewValue}>{selectedItem.email}</Text>
                      </View>
                      <View style={styles.viewItem}>
                        <View style={styles.viewLabel}>
                          <Feather name="hash" size={16} color="#4361ee" />
                          <Text style={styles.viewLabelText}>ID</Text>
                        </View>
                        <Text style={[styles.viewValue, styles.idValue]}>{selectedItem.code}</Text>
                      </View>
                      <View style={styles.viewItem}>
                        <View style={styles.viewLabel}>
                          <Feather name="grid" size={16} color="#4361ee" />
                          <Text style={styles.viewLabelText}>Department</Text>
                        </View>
                        <Text style={styles.viewValue}>{selectedItem.department || 'General'}</Text>
                      </View>
                      <View style={styles.viewItem}>
                        <View style={styles.viewLabel}>
                          <Feather name="phone" size={16} color="#4361ee" />
                          <Text style={styles.viewLabelText}>Phone</Text>
                        </View>
                        <Text style={styles.viewValue}>{selectedItem.phoneNumber}</Text>
                      </View>
                      <View style={styles.viewItem}>
                        <View style={styles.viewLabel}>
                          <Feather name="calendar" size={16} color="#4361ee" />
                          <Text style={styles.viewLabelText}>Academic Year</Text>
                        </View>
                        <Text style={styles.viewValue}>{selectedItem.academicYear || '2024'}</Text>
                      </View>
                      {selectedItem.role === 'student' && (
                        <View style={styles.viewItem}>
                          <View style={styles.viewLabel}>
                            <Feather name="star" size={16} color="#4361ee" />
                            <Text style={styles.viewLabelText}>GPA</Text>
                          </View>
                          <Text style={[styles.viewValue, { color: getGpaColor(selectedItem.gpa), fontWeight: 'bold' }]}>
                            {selectedItem.gpa || 'Not set'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
                
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsViewModalOpen(false)}>
                    <Text style={styles.cancelText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.submitBtn} 
                    onPress={() => {
                      setIsViewModalOpen(false);
                      handleEdit(selectedItem);
                    }}
                  >
                    <Text style={styles.submitText}>Edit</Text>
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
                <Feather name="edit-2" size={24} color="#4caf50" />
                <Text style={styles.modalTitle}>Update Details</Text>
              </View>
              <TouchableOpacity onPress={() => setIsEditModalOpen(false)}>
                <Feather name="x" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Name (Read Only)</Text>
                  <TextInput 
                    style={[styles.input, styles.disabledInput]} 
                    value={selectedItem.fullName || selectedItem.courseName || ''} 
                    editable={false} 
                  />
                </View>
                
                <View style={styles.formGroup}>
                  <Text style={styles.label}>
                    New {selectedItem.courseName ? 'Room Number' : 'Department'}
                  </Text>
                  <TextInput 
                    style={styles.input} 
                    value={editFieldValue} 
                    onChangeText={setEditFieldValue} 
                    placeholder={`Enter new ${selectedItem.courseName ? 'room number' : 'department'}`}
                  />
                </View>

                {!selectedItem.courseName && selectedItem.role === 'student' && (
                  <View style={styles.formGroup}>
                    <View style={styles.labelWithIcon}>
                      <Feather name="star" size={16} color="#4361ee" />
                      <Text style={styles.label}> GPA</Text>
                    </View>
                    <TextInput 
                      style={styles.input} 
                      value={editGpaValue} 
                      onChangeText={setEditGpaValue} 
                      placeholder="GPA (0-4)"
                      keyboardType="numeric"
                    />
                    <Text style={styles.hintText}>GPA must be between 0 and 4</Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditModalOpen(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.submitBtn, styles.successBtn]} onPress={handleSaveChanges}>
                    <Text style={styles.submitText}>Update</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
                <Feather name="key" size={24} color="#4361ee" />
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

      {/* Add User Modal */}
      <Modal visible={isAddUserModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Feather name="user-plus" size={24} color="#4361ee" />
                <Text style={styles.modalTitle}>Add User</Text>
              </View>
              <TouchableOpacity onPress={() => setIsAddUserModalOpen(false)}>
                <Feather name="x" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput 
                style={styles.input} 
                placeholder="Full Name *" 
                value={newUserData.fullName} 
                onChangeText={t => setNewUserData({...newUserData, fullName: t})} 
              />
              <TextInput 
                style={styles.input} 
                placeholder="Email *" 
                value={newUserData.email} 
                onChangeText={t => setNewUserData({...newUserData, email: t})} 
                keyboardType="email-address" 
                autoCapitalize="none" 
              />
              <TextInput 
                style={styles.input} 
                placeholder="Password *" 
                value={newUserData.password} 
                onChangeText={t => setNewUserData({...newUserData, password: t})} 
                secureTextEntry 
              />
              
              <Text style={styles.label}>Select Role *</Text>
              <View style={styles.chipsRow}>
                {['student', 'instructor', 'admin'].map(role => (
                  <TouchableOpacity 
                    key={role} 
                    onPress={() => setNewUserData({...newUserData, role})} 
                    style={[styles.chip, newUserData.role === role && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, newUserData.role === role && styles.chipTextActive]}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Department</Text>
              <View style={styles.chipsRow}>
                {['CS', 'IT', 'IS', 'AI', 'General'].map(dept => (
                  <TouchableOpacity 
                    key={dept} 
                    onPress={() => setNewUserData({...newUserData, department: dept})} 
                    style={[styles.chip, newUserData.department === dept && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, newUserData.department === dept && styles.chipTextActive]}>
                      {dept}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput 
                style={styles.input} 
                placeholder="Academic Year" 
                value={newUserData.academicYear} 
                onChangeText={t => setNewUserData({...newUserData, academicYear: t})} 
              />
              <TextInput 
                style={styles.input} 
                placeholder="Student/Staff Code" 
                value={newUserData.code} 
                onChangeText={t => setNewUserData({...newUserData, code: t})} 
              />
              <TextInput 
                style={styles.input} 
                placeholder="Phone Number *" 
                value={newUserData.phoneNumber} 
                onChangeText={t => setNewUserData({...newUserData, phoneNumber: t})} 
                keyboardType="phone-pad" 
              />
              
              {newUserData.role === 'student' && (
                <>
                  <TextInput 
                    style={styles.input} 
                    placeholder="GPA (0-4) *" 
                    value={newUserData.gpa} 
                    onChangeText={t => setNewUserData({...newUserData, gpa: t})} 
                    keyboardType="numeric"
                  />
                  <Text style={styles.hintText}>Note: GPA should be between 0 and 4</Text>
                </>
              )}
              
              <View style={styles.modalActions}>
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

      {/* Add Course Modal */}
      <Modal visible={isAddCourseModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Feather name="book-open" size={24} color="#4361ee" />
                <Text style={styles.modalTitle}>Add Course</Text>
              </View>
              <TouchableOpacity onPress={() => setIsAddCourseModalOpen(false)}>
                <Feather name="x" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput 
                style={styles.input} 
                placeholder="Course Name *" 
                value={newCourseData.courseName} 
                onChangeText={t => setNewCourseData({...newCourseData, courseName: t})} 
              />
              <TextInput 
                style={styles.input} 
                placeholder="Course Code *" 
                value={newCourseData.courseId} 
                onChangeText={t => setNewCourseData({...newCourseData, courseId: t})} 
              />
              <TextInput 
                style={styles.input} 
                placeholder="Instructor Name *" 
                value={newCourseData.instructorName} 
                onChangeText={t => setNewCourseData({...newCourseData, instructorName: t})} 
              />
              
              <Text style={styles.label}>Select Day *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysScroll}>
                {['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'].map(day => (
                  <TouchableOpacity 
                    key={day} 
                    onPress={() => setNewCourseData({...newCourseData, SelectDays: day})} 
                    style={[styles.chip, newCourseData.SelectDays === day && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, newCourseData.SelectDays === day && styles.chipTextActive]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextInput 
                style={styles.input} 
                placeholder="Time (e.g., 10:00 AM) *" 
                value={newCourseData.Time} 
                onChangeText={t => setNewCourseData({...newCourseData, Time: t})} 
              />
              <TextInput 
                style={styles.input} 
                placeholder="Room Number *" 
                value={newCourseData.RoomNumber} 
                onChangeText={t => setNewCourseData({...newCourseData, RoomNumber: t})} 
              />
              <TextInput 
                style={styles.input} 
                placeholder="Capacity *" 
                value={newCourseData.capacity} 
                onChangeText={t => setNewCourseData({...newCourseData, capacity: t})} 
                keyboardType="numeric" 
              />
              
              <View style={styles.modalActions}>
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
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderColor: '#e2e8f0' 
  },
  headerSubtitle: { 
    color: '#64748b', 
    fontSize: 13, 
    fontWeight: '600', 
    marginTop: 2 
  },
  headerTitle: { 
    color: '#1e293b', 
    fontSize: 20, 
    fontWeight: 'bold' 
  },
  userAvatar: { 
    backgroundColor: '#4361ee', 
    width: 50, 
    height: 50, 
    borderRadius: 25, 
    justifyContent: 'center', 
    alignItems: 'center', 
    position: 'relative' 
  },
  userAvatarImage: { 
    width: 50, 
    height: 50, 
    borderRadius: 25, 
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
    backgroundColor: '#10b981', 
    width: 20, 
    height: 20, 
    borderRadius: 10, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 2, 
    borderColor: '#fff' 
  },
  addPhotoText: { 
    color: '#fff', 
    fontSize: 12, 
    fontWeight: 'bold' 
  },
  removeText: { 
    color: '#ef4444', 
    fontSize: 12, 
    marginTop: 5, 
    fontWeight: 'bold' 
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 15,
    paddingHorizontal: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1e293b',
  },

  topNav: { 
    backgroundColor: '#fff', 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderColor: '#e2e8f0',
    maxHeight: 60,
  },
  navItem: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18, 
    paddingVertical: 8, 
    borderRadius: 20, 
    backgroundColor: '#f1f5f9', 
    marginHorizontal: 5,
    gap: 6,
  },
  navItemActive: { 
    backgroundColor: '#4361ee',
  },
  navItemLogout: { 
    backgroundColor: '#fee2e2',
  },
  navText: { 
    color: '#64748b', 
    fontWeight: '600', 
    fontSize: 13 
  },
  navTextActive: { 
    color: '#fff', 
    fontWeight: '600', 
    fontSize: 13 
  },
  navTextLogout: { 
    color: '#ef4444', 
    fontWeight: '600', 
    fontSize: 13 
  },

  mainContent: { 
    padding: 15,
    flex: 1,
  },

  quickActionsGrid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap',
    justifyContent: 'space-between', 
    marginBottom: 20,
    gap: 10,
  },
  actionBtn: { 
    width: '48%', 
    padding: 15, 
    borderRadius: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8, 
    elevation: 2,
    marginBottom: 10,
  },
  actionBtnText: { 
    color: '#fff', 
    fontWeight: 'bold', 
    fontSize: 15 
  },

  middleRowGrid: {
    gap: 15,
    marginBottom: 20,
  },

  card: { 
    backgroundColor: '#fff', 
    padding: 15, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: '#e2e8f0', 
    marginBottom: 15 
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 15,
  },
  cardTitle: { 
    fontSize: 16, 
    fontWeight: 'bold', 
    color: '#1e293b', 
  },
  
  deptRow: { 
    marginBottom: 15 
  },
  deptHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 5 
  },
  deptName: { 
    color: '#475569', 
    fontWeight: '500' 
  },
  deptCount: { 
    fontWeight: 'bold', 
    color: '#1e293b' 
  },
  progressBarBg: { 
    height: 8, 
    backgroundColor: '#f1f5f9', 
    borderRadius: 4 
  },
  progressBarFill: { 
    height: '100%', 
    borderRadius: 4 
  },

  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  activityIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityText: {
    flex: 1,
  },
  activityTitle: {
    fontWeight: '600',
    color: '#1e293b',
    fontSize: 14,
  },
  activitySubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },

  tablesRowGrid: {
    gap: 15,
  },

  tableCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 15,
    marginBottom: 15,
  },

  fullPageTable: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 15,
  },

  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  viewAllLink: {
    color: '#4361ee',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#4361ee',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },

  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
  },
  headerCell: {
    fontWeight: 'bold',
    color: '#475569',
    fontSize: 13,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  cell: {
    fontSize: 13,
    color: '#334155',
  },
  boldCell: {
    fontWeight: '600',
    color: '#1e293b',
  },

  userInfo: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userCode: {
    color: '#64748b',
    fontSize: 12,
    width: 60,
  },
  userNameText: {
    fontWeight: '600',
    color: '#1e293b',
    fontSize: 14,
  },
  userBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '500',
  },
  instructorText: {
    color: '#4361ee',
  },
  studentText: {
    color: '#10b981',
  },
  gpaText: {
    fontSize: 12,
    fontWeight: '600',
    width: 50,
  },

  courseInfo: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  courseCodeText: {
    color: '#64748b',
    fontSize: 12,
    width: 60,
  },
  courseNameText: {
    fontWeight: '600',
    color: '#1e293b',
    fontSize: 14,
  },
  instructorName: {
    flex: 1,
    color: '#475569',
    fontSize: 13,
  },

  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    alignSelf: 'flex-start',
  },
  instructorBadge: {
    backgroundColor: '#4361ee',
  },
  studentBadge: {
    backgroundColor: '#10b981',
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },

  dayBadge: {
    backgroundColor: '#eef2ff',
    color: '#4361ee',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 11,
    fontWeight: '600',
    alignSelf: 'flex-start',
  },

  gpaValue: {
    fontWeight: '600',
    fontSize: 12,
  },

  rowActions: {
    flexDirection: 'row',
    gap: 12,
    marginLeft: 'auto',
  },
  actionIcon: {
    padding: 4,
  },

  mutedText: {
    color: '#94a3b8',
    fontSize: 12,
  },

  developmentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  developmentText: {
    color: '#94a3b8',
    fontSize: 16,
    marginTop: 15,
  },

  passwordFloatingButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#4361ee',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    gap: 8,
  },
  passwordButtonText: {
    color: '#fff',
    fontWeight: '600',
  },

  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    padding: 15 
  },
  modalContent: { 
    backgroundColor: '#fff', 
    padding: 20, 
    borderRadius: 20, 
    maxHeight: '85%' 
  },
  smallModal: {
    maxHeight: '60%',
  },
  viewModal: {
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: '#1e293b', 
  },

  viewContent: {
    marginBottom: 20,
  },
  viewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#eef2ff',
    marginBottom: 15,
    gap: 6,
  },
  viewBadgeText: {
    color: '#4361ee',
    fontWeight: '600',
    fontSize: 13,
  },
  viewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
  },
  viewItem: {
    width: '48%',
  },
  viewItemFull: {
    width: '100%',
  },
  viewLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  viewLabelText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
  },
  viewValue: {
    color: '#1e293b',
    fontSize: 14,
    fontWeight: '500',
    paddingLeft: 22,
  },
  idValue: {
    color: '#4361ee',
    fontWeight: '600',
  },

  formGroup: {
    marginBottom: 15,
  },
  formGroupSingle: {
    marginBottom: 15,
  },
  label: {
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  labelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: { 
    backgroundColor: '#f8fafc', 
    borderWidth: 1, 
    borderColor: '#e2e8f0', 
    borderRadius: 10, 
    padding: 12, 
    marginBottom: 8, 
    color: '#1e293b',
    fontSize: 14,
  },
  disabledInput: {
    backgroundColor: '#f1f5f9',
    color: '#94a3b8',
  },
  hintText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: -5,
    marginBottom: 10,
  },

  chipsRow: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    marginBottom: 15 
  },
  daysScroll: {
    marginBottom: 15,
  },
  chip: { 
    paddingHorizontal: 15, 
    paddingVertical: 8, 
    borderRadius: 20, 
    backgroundColor: '#f1f5f9', 
    marginRight: 8, 
    marginBottom: 8, 
    borderWidth: 1, 
    borderColor: '#e2e8f0' 
  },
  chipActive: { 
    backgroundColor: '#4361ee', 
    borderColor: '#4361ee' 
  },
  chipText: { 
    color: '#64748b', 
    fontWeight: '500' 
  },
  chipTextActive: { 
    color: '#fff', 
    fontWeight: '500' 
  },

  modalActions: { 
    flexDirection: 'row', 
    justifyContent: 'flex-end', 
    marginTop: 20, 
    gap: 10 
  },
  cancelBtn: { 
    paddingVertical: 12, 
    paddingHorizontal: 20, 
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
    paddingHorizontal: 20, 
    borderRadius: 10, 
    backgroundColor: '#4361ee', 
    flex: 1, 
    alignItems: 'center' 
  },
  successBtn: {
    backgroundColor: '#4caf50',
  },
  submitText: { 
    color: '#fff', 
    fontWeight: 'bold' 
  },
});