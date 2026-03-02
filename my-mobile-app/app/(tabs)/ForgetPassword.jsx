import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  StyleSheet, 
  Alert 
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "./firebase"; // مسار الفايربيز الصح بتاعك بنقطة واحدة اهو
import { useRouter } from 'expo-router'; // ضفنا الروتر هنا

const teamLogo = require('../../assets/images/yallaclass_logo.jpg');

// شيلنا الـ navigation من الأقواس خالص
export default function ForgetPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter(); // عرفنا الروتر

  const handleResetPassword = async () => {
    if (email === "") {
      Alert.alert("تنبيه", "Please enter your email address");
      return;
    }

    setIsLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert("نجاح", "Password reset email sent! Please check your inbox.");
      
      // هنا استخدمنا الروتر عشان يرجع للوجين بدل الـ navigation اللي كانت بتضرب إيرور
      router.back();
      
    } catch (error) {
      console.error("Error sending reset email:", error);
      Alert.alert("فشل", error.message);
    } finally {
      setIsLoading(false);
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
          <Text style={styles.login_title}>Reset Password</Text>
          
          <Text style={styles.description}>
            Enter your email address and we'll send you a link to reset your password.
          </Text>
          
          <Text style={styles.label}>Email</Text>
          <View style={styles.input_wrapper}>
            <Feather name="mail" size={18} color="#888" style={styles.input_icon_left} />
            <TextInput 
              style={styles.input_with_icon}
              placeholder="example@mail.com"
              placeholderTextColor="#9ca3af"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          
          <LinearGradient
            colors={['#1CB1F2', '#1575D7']}
            style={styles.login_button_gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <TouchableOpacity 
              style={styles.login_button_content} 
              onPress={handleResetPassword}
              disabled={isLoading}
            >
                <Text style={styles.login_button_text}>
                  {isLoading ? "Sending..." : "Send Reset Link"}
                </Text>
                {!isLoading && <Feather name="send" size={20} color="white" />}
            </TouchableOpacity>
          </LinearGradient>

          {/* زرار الرجوع متظبط هنا */}
          <TouchableOpacity 
            onPress={() => router.back()}
            style={styles.back_container}
          >
            {/* ضفنا marginRight للأيقونة عشان تبعد عن الكلمة */}
            <Feather name="arrow-left" size={18} color="#888" style={{ marginRight: 8 }} />
            <Text style={styles.back_text}>Back to Login</Text>
          </TouchableOpacity>
          
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
    fontSize: 24,
    color: '#1575D7',
    marginBottom: 10,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 25,
    lineHeight: 22,
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
    marginBottom: 20,
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
  // تظبيط الستايل بتاع زرار الرجوع
  back_container: {
    flexDirection: 'row', // دي اللي بتخليهم جنب بعض
    alignItems: 'center',
    marginTop: 20,
  },
  back_text: {
    color: '#888',
    fontSize: 15,
  }
});