import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

type Mode = 'signin' | 'signup';
type AccountRole = (typeof accountRoles)[number]['value'];
const accountRoles = [
  { value: 'patient', label: 'Patient' },
  { value: 'administrator', label: 'Administrator' },
  { value: 'hospital_staff', label: 'Hospital staff' },
  { value: 'ambulance_coordinator', label: 'Ambulance / emergency worker' },
] as const;

function normalizePakistaniMobile(input: string) {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('92')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^3\d{9}$/.test(digits) ? `+92${digits}` : null;
}

export default function AuthScreen({ onRoleChosen }: { onRoleChosen: (role: AccountRole) => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [demoRole, setDemoRole] = useState<AccountRole>('patient');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      Alert.alert('Check your email', 'Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }

    if (mode === 'signup') {
      const cleanName = fullName.trim();
      const phoneE164 = normalizePakistaniMobile(mobile);
      if (cleanName.length < 2) {
        Alert.alert('Add your name', 'Enter your full name to create the account.');
        return;
      }
      if (!phoneE164) {
        Alert.alert('Check your Pakistani mobile number', 'Enter a valid Pakistani mobile number, such as 3001234567. It will be saved as +923001234567.');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Passwords do not match', 'Re-enter the same password in both password fields.');
        return;
      }
    }

    if (!isSupabaseConfigured || !supabase) {
      Alert.alert('Account storage is not connected', 'Your entries were not saved. Connect Sahara to Supabase first; never save account passwords only on this phone.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        const phoneE164 = normalizePakistaniMobile(mobile)!;
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { full_name: fullName.trim(), phone_e164: phoneE164, demo_role: demoRole } },
        });
        if (error) throw error;
        if (data.session) onRoleChosen(demoRole);
        if (!data.session) {
          Alert.alert('Check your email', 'We sent a confirmation link. Confirm your email, then sign in. Your mobile number is saved in your profile; it has not been SMS-verified.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        // Prototype: let the user pick any dashboard on the sign-in screen. Persist that choice in user metadata.
        await supabase.auth.updateUser({ data: { demo_role: demoRole } });
        onRoleChosen(demoRole);
      }
    } catch (e) {
      Alert.alert(mode === 'signup' ? 'Could not create account' : 'Could not sign in', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const signingUp = mode === 'signup';
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
          <View style={s.brandRow}><View style={s.logo}><Text style={s.logoMark}>✚</Text></View><View><Text style={s.brand}>Sahara</Text><Text style={s.tagline}>RIGHT CARE. RIGHT NOW.</Text></View></View>
          <Text style={s.eyebrow}>HYDERABAD • HEALTHCARE SUPPORT</Text>
          <Text style={s.title}>{signingUp ? 'Create your\nSahara account.' : 'Choose a role,\nthen sign in.'}</Text>
          <Text style={s.subtitle}>{signingUp ? 'Save your contact details and choose the dashboard to open.' : 'Choose your role, then sign in to open its dashboard.'}</Text>

          <View style={s.switcher}>
            <TouchableOpacity onPress={() => setMode('signin')} style={[s.switch, !signingUp && s.switchActive]}><Text style={[s.switchText, !signingUp && s.switchTextActive]}>Sign in</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('signup')} style={[s.switch, signingUp && s.switchActive]}><Text style={[s.switchText, signingUp && s.switchTextActive]}>Create account</Text></TouchableOpacity>
          </View>

          {signingUp && <><Text style={s.label}>FULL NAME</Text><TextInput value={fullName} onChangeText={setFullName} style={s.input} placeholder="Your name" autoCapitalize="words" returnKeyType="next" />
            <Text style={s.label}>PAKISTANI MOBILE NUMBER</Text><View style={s.phoneRow}><View style={s.countryCode}><Text style={s.countryCodeText}>🇵🇰  +92</Text></View><TextInput value={mobile} onChangeText={setMobile} style={s.phoneInput} placeholder="300 1234567" keyboardType="phone-pad" maxLength={16} /></View><Text style={s.hint}>Enter 10 digits after +92. We’ll normalize numbers beginning with 03 automatically.</Text></>}

          <><Text style={s.label}>CHOOSE YOUR ROLE</Text><View style={s.roleChoices}>{accountRoles.map(role=><TouchableOpacity key={role.value} onPress={()=>setDemoRole(role.value)} style={[s.roleChoice,demoRole===role.value&&s.roleChoiceSelected]}><Text style={[s.roleChoiceText,demoRole===role.value&&s.roleChoiceTextSelected]}>{role.label}</Text></TouchableOpacity>)}</View></>

          <Text style={s.label}>EMAIL ADDRESS</Text><TextInput value={email} onChangeText={setEmail} style={s.input} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Text style={s.label}>PASSWORD {signingUp ? '(8 characters minimum)' : ''}</Text><TextInput value={password} onChangeText={setPassword} style={s.input} placeholder="Enter password" secureTextEntry autoCapitalize="none" />
          {signingUp && <><Text style={s.label}>CONFIRM PASSWORD</Text><TextInput value={confirmPassword} onChangeText={setConfirmPassword} style={s.input} placeholder="Enter password again" secureTextEntry autoCapitalize="none" /></>}

          <TouchableOpacity disabled={busy} style={[s.button, busy && s.buttonBusy]} onPress={submit}><Text style={s.buttonText}>{busy ? 'Please wait…' : signingUp ? 'Create account' : 'Sign in'}  →</Text></TouchableOpacity>
          {!isSupabaseConfigured && <View style={s.setupNotice}><Text style={s.setupTitle}>Account saving isn’t connected yet</Text><Text style={s.setupText}>Validation works now. To save accounts securely, connect a Supabase project. No password is stored on this device.</Text></View>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F8F6' }, flex: { flex: 1 }, page: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 36 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 32 }, logo: { width: 43, height: 43, borderRadius: 15, backgroundColor: '#126B54', alignItems: 'center', justifyContent: 'center' }, logoMark: { color: '#fff', fontSize: 23, fontWeight: '800' }, brand: { color: '#123F35', fontWeight: '800', fontSize: 21 }, tagline: { color: '#79918A', fontSize: 8, letterSpacing: 1.3, fontWeight: '700', marginTop: 1 },
  eyebrow: { color: '#27836A', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 }, title: { color: '#183D34', fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -0.7, marginTop: 8 }, subtitle: { color: '#6B807A', fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 20 }, switcher: { flexDirection: 'row', backgroundColor: '#E9EFEC', borderRadius: 12, padding: 4, marginBottom: 20 }, switch: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 }, switchActive: { backgroundColor: '#fff' }, switchText: { color: '#71827A', fontSize: 12, fontWeight: '700' }, switchTextActive: { color: '#176A54' },
  label: { color: '#82928D', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 12, marginBottom: 7 }, input: { height: 46, borderRadius: 11, borderWidth: 1, borderColor: '#E3EBE7', backgroundColor: '#fff', paddingHorizontal: 13, color: '#294A41', fontSize: 13 }, phoneRow: { height: 46, flexDirection: 'row', gap: 8 }, countryCode: { borderRadius: 11, borderWidth: 1, borderColor: '#E3EBE7', backgroundColor: '#EEF5F1', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, countryCodeText: { color: '#225A48', fontSize: 12, fontWeight: '800' }, phoneInput: { flex: 1, borderRadius: 11, borderWidth: 1, borderColor: '#E3EBE7', backgroundColor: '#fff', paddingHorizontal: 13, color: '#294A41', fontSize: 13 }, hint: { color: '#8A9992', fontSize: 9, marginTop: 5 },
  button: { marginTop: 22, height: 48, borderRadius: 13, backgroundColor: '#126B54', alignItems: 'center', justifyContent: 'center' }, buttonBusy: { opacity: 0.6 }, buttonText: { color: '#fff', fontSize: 13, fontWeight: '800' }, setupNotice: { marginTop: 14, borderRadius: 12, padding: 12, backgroundColor: '#FFF4DF' }, setupTitle: { color: '#855B18', fontSize: 11, fontWeight: '800' }, setupText: { color: '#8A6C38', fontSize: 10, lineHeight: 15, marginTop: 4 }, roleChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, roleChoice: { borderWidth: 1, borderColor: '#E3EBE7', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: '#fff' }, roleChoiceSelected: { backgroundColor: '#E5F4EE', borderColor: '#B5DDCD' }, roleChoiceText: { color: '#6A7E77', fontSize: 11, fontWeight: '600' }, roleChoiceTextSelected: { color: '#176A54', fontWeight: '800' }, footnote: { textAlign: 'center', color: '#82918A', fontSize: 10, lineHeight: 15, marginTop: 17 },
});
