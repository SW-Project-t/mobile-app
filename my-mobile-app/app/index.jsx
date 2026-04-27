import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  StyleSheet, 
  Alert,
  Platform,
  ActivityIndicator
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from "./firebase";
import AsyncStorage from '@react-native-async-storage/async-storage';

const teamLogo = require('../assets/images/yallaclass_logo.jpg');

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleSignIn = async () => {
    if (email === "" || password === "") {
      Alert.alert("تنبيه", "Please enter both email and password");
      return;
    }
    
    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const idToken = await user.getIdToken();
      
      const apiUrl = Platform.OS === 'web' 
        ? 'https://backend-2-qju2.onrender.com/verify-login' 
        : 'http://192.168.1.103:3001/verify-login';

      let tokenToSave = idToken;
      
      try {
        const response = await axios.post(apiUrl, { idToken: idToken });
        if (response.data.success && response.data.token) {
          tokenToSave = response.data.token;
        }
      } catch (backendError) {
        console.log("Backend verification skipped or failed, proceeding with Firebase logic.");
      }
      
      await AsyncStorage.setItem('token', tokenToSave);
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      setIsLoading(false);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const userRole = userData.role?.toLowerCase() || ''; 
        if (userRole === 'student') {
          router.replace('/StudentDashboard');
        } 
        else if (userRole === 'instructor' || userRole === 'professor') {
          router.replace('/ProfessorDashboard');
        } 
        else if (userRole === 'admin') {
          router.replace('/AdminDashboard');
        } 
        else {
          Alert.alert("خطأ", "Role not recognized: " + userRole);
        }
      } else {
        Alert.alert("خطأ", "User data not found in database!");
      }

    } catch (error) {
      setIsLoading(false);
      console.error("Login Error: ", error);
      Alert.alert("فشل الدخول", "Invalid email or password");
    }
  };

  return (
    <LinearGradient
      colors={['#1CB1F2', '#EAF5FF']} 
      style={styles.container1}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <View style={styles.container2}>
        <View style={styles.header_brand}>
          <Image source={teamLogo} style={styles.brand_logo} />
          <Text style={styles.logo_text}>Yalla Class</Text>
        </View>

        <View style={styles.login_container}>
          <Text style={styles.login_title}>Login</Text>
          
          <Text style={styles.label}>Email</Text>
          <View style={styles.input_wrapper}>
            <Feather name="mail" size={18} color="#888" style={styles.input_icon_left} />
            <TextInput 
              style={styles.input_with_icon}
              placeholder="Enter your email"
              placeholderTextColor="#9ca3af"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          
          <Text style={styles.label}>Password</Text>
          <View style={styles.input_wrapper}>
            <Feather name="lock" size={18} color="#888" style={styles.input_icon_left} />
            <TextInput 
              style={[styles.input_with_icon, styles.input_with_right_icon]} 
              placeholder="Enter your password" 
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity style={styles.toggle_password_icon} onPress={togglePasswordVisibility}>
              <Feather name={showPassword ? "eye-off" : "eye"} size={18} color="#888" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => router.push('/ForgetPassword')}>
            <Text style={styles.forgot_password}>Forgot Password?</Text>
          </TouchableOpacity>

          <LinearGradient
            colors={['#1CB1F2', '#1575D7']}
            style={styles.login_button_gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <TouchableOpacity style={styles.login_button_content} onPress={handleSignIn} disabled={isLoading}>
                {isLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Text style={styles.login_button_text}>Sign in</Text>
                    <Feather name="arrow-right" size={20} color="white" />
                  </>
                )}
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container1: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container2: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 25,
    padding: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header_brand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  brand_logo: {
    width: 35,
    height: 35,
    marginRight: 10,
    borderRadius: 8,
  },
  logo_text: {
    fontSize: 22,
    color: '#1575D7',
    fontWeight: 'bold',
  },
  login_container: {
    width: '100%',
  },
  login_title: {
    fontSize: 26,
    color: '#1575D7',
    marginBottom: 15,
    fontWeight: 'bold',
  },
  label: {
    color: '#555',
    fontSize: 14,
    marginBottom: 6,
    marginTop: 10,
  },
  input_wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F8FF',
    borderRadius: 8,
    height: 50,
    borderWidth: 1,
    borderColor: '#D4E9FF',
    marginBottom: 10,
  },
  input_icon_left: {
    paddingHorizontal: 12,
  },
  input_with_icon: {
    flex: 1,
    height: '100%',
    color: '#333',
    fontSize: 16,
  },
  input_with_right_icon: {
    paddingRight: 40,
  },
  toggle_password_icon: {
    position: 'absolute',
    right: 12,
    padding: 5,
  },
  forgot_password: {
    color: '#888',
    fontSize: 14,
    marginTop: 10,
    marginBottom: 20,
  },
  login_button_gradient: {
    borderRadius: 8,
    marginTop: 10,
  },
  login_button_content: {
    flexDirection: 'row',
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  login_button_text: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
  },
});