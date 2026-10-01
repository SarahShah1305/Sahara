import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAudioPlayer } from 'expo-audio';
import * as Location from 'expo-location';
import hospitalDataset from './src/data/hospitals.json';
import specialtyCatalog from './src/data/specialties.json';
import AuthScreen from './src/features/auth/AuthScreen';
import { supabase } from './src/lib/supabase';

const needs = ['General bed', 'Private room', 'Emergency', 'ICU', 'NICU', 'Ventilator', 'Isolation', 'Operation theatre', 'Trauma', 'Dialysis'];
type DemoRole = 'Patient' | 'Hospital staff' | 'Administrator' | 'Ambulance / emergency worker';
type FlowStep = 'home' | 'location' | 'need' | 'filters' | 'results' | 'dashboard';
type UserCoordinates = { latitude: number; longitude: number };

function distanceKm(from: UserCoordinates, to: UserCoordinates) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const resourceTypes: Record<string, string> = { 'General bed': 'general_bed', 'Private room': 'private_room', Emergency: 'emergency_bed', ICU: 'icu_bed', NICU: 'nicu_bed', Ventilator: 'ventilator', Isolation: 'isolation_bed', 'Operation theatre': 'operation_theatre', Trauma: 'trauma_bed', Dialysis: 'dialysis_machine' };
function availableForNeed(hospital: (typeof hospitalDataset.records)[number], need: string, live: Record<string, Record<string, number>>) {
  const key: Record<string, string> = { 'General bed': 'generalBeds', 'Private room': 'privateRooms', Emergency: 'emergencyBeds', ICU: 'icuBeds', NICU: 'nicuBeds', Ventilator: 'ventilators', Isolation: 'isolationBeds', 'Operation theatre': 'operationTheatres', Trauma: 'traumaBeds', Dialysis: 'dialysisMachines' };
  const serverCount = live[hospital.id]?.[resourceTypes[need]];
  if (typeof serverCount === 'number') return serverCount;
  if (need === 'Private room') return Math.max(2, Math.round(hospital.totalBedsReported / 30));
  const resource = (hospital.resources as any)[key[need]];
  return resource?.available ?? 0;
}
function canonicalSpecialty(value: string) {
  const q=value.trim().toLowerCase();
  const aliases: Record<string,string> = { cardiologist:'Cardiology', neurologist:'Neurology', nuerology:'Neurology', nuerologist:'Neurology', pediatrician:'Pediatrics', paediatrician:'Pediatrics', pedriatician:'Pediatrics', paediatrics:'Pediatrics', gynaecologist:'Gynecology & Obstetrics', gynecologist:'Gynecology & Obstetrics', obgyn:'Gynecology & Obstetrics', ent:'ENT', eye:'Ophthalmology', dentist:'Dentistry', nephrologist:'Nephrology', urologist:'Urology', orthopedist:'Orthopedics', dermatologist:'Dermatology' };
  return aliases[q] || specialtyCatalog.find((item:string)=>item.toLowerCase()===q) || value.trim();
}
function nextDays() { return Array.from({length:14},(_,offset) => { const d = new Date(); d.setDate(d.getDate()+offset); return { value: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`, label: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : d.toLocaleDateString('en-PK',{weekday:'short',day:'numeric',month:'short'}) }; }); }
function roleLabel(value: unknown): DemoRole { if (value === 'administrator') return 'Administrator'; if (value === 'hospital_staff') return 'Hospital staff'; if (value === 'ambulance_coordinator') return 'Ambulance / emergency worker'; return 'Patient'; }
function pickerValue(day: string, time: string) { return new Date(`${day}T${time}:00+05:00`); }
function pakistanDate(value: Date) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(value); }
function pakistanTime(value: Date) { return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(value); }

export default function App() {
  const confirmationPlayer = useAudioPlayer(require('./assets/confirmation.wav'));
  const [authLoaded, setAuthLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [screen, setScreen] = useState<FlowStep>('home');
  const [need, setNeed] = useState('ICU');
  const [urgency, setUrgency] = useState('Urgent today');
  const [manualLocation, setManualLocation] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [coordinates, setCoordinates] = useState<UserCoordinates | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [radiusKm, setRadiusKm] = useState(10);
  const [maxBudget, setMaxBudget] = useState('');
  const [providerType, setProviderType] = useState('Any');
  const [specialtyQuery, setSpecialtyQuery] = useState('');
  const [open24Only, setOpen24Only] = useState(false);
  const [ambulanceOnly, setAmbulanceOnly] = useState(false);
  const [searched, setSearched] = useState(false);
  const [liveCapacity, setLiveCapacity] = useState<Record<string, Record<string, number>>>({});
  const [dashboardRole, setDashboardRole] = useState<DemoRole>('Patient');
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [bookingHospital, setBookingHospital] = useState<(typeof hospitalDataset.records)[number] | null>(null);
  const [bookingResource, setBookingResource] = useState<string | null>(null);
  const [appointmentDay, setAppointmentDay] = useState(nextDays()[1].value);
  const [appointmentTime, setAppointmentTime] = useState('10:00');
  const [bookingBusy, setBookingBusy] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmationStep, setConfirmationStep] = useState<'checking'|'confirmed'|'error'>('checking');
  const [confirmationError, setConfirmationError] = useState('');
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [appointmentStatus, setAppointmentStatus] = useState('');
  const [appointmentInfo, setAppointmentInfo] = useState<{hospital:string;doctor:string;specialty:string;when:string;resource:string|null}|null>(null);
  const [demoAppointments, setDemoAppointments] = useState<any[]>([]);

  async function useCurrentLocation() {
    setLocationBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location permission not granted', 'You can type a neighborhood instead. To calculate nearby distance, allow location while using Sahara.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setCoordinates(point);
      try {
        const [place] = await Location.reverseGeocodeAsync(point);
        const label = [place?.name, place?.district, place?.city].filter(Boolean).join(', ');
        setLocationLabel(label || `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`);
      } catch {
        setLocationLabel(`${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`);
      }
    } catch {
      Alert.alert('Could not get your location', 'Try again or enter a neighborhood manually.');
    } finally {
      setLocationBusy(false);
    }
  }

  async function continueWithManualLocation() {
    const entered = manualLocation.trim();
    if (!entered) {
      Alert.alert('Enter a location', 'Use your current location or type a neighborhood/address in Hyderabad.');
      return;
    }
    setCoordinates(null);
    setLocationLabel(entered);
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status === 'granted') {
        const [point] = await Location.geocodeAsync(`${entered}, Hyderabad, Sindh, Pakistan`);
        if (point) setCoordinates({ latitude: point.latitude, longitude: point.longitude });
      }
    } catch {
      // Keep the typed area and use text matching if geocoding is unavailable.
    }
    setScreen('need');
  }

  useEffect(() => {
    if (!supabase) { setAuthLoaded(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      setUserId(session?.user.id ?? null);
      if (session) { const role = roleLabel(session.user.user_metadata?.demo_role); setDashboardRole(role); setScreen(role === 'Patient' ? 'home' : 'dashboard'); }
      setAuthLoaded(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      if (session) { const role = roleLabel(session.user.user_metadata?.demo_role); setDashboardRole(role); setScreen(role === 'Patient' ? 'home' : 'dashboard'); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function refreshDemoData() {
    if (!supabase) return;
    const { data: capacity } = await supabase.from('hospital_resources').select('hospital_id,resource_type,available');
    if (capacity) {
      const next: Record<string, Record<string, number>> = {};
      capacity.forEach((row: any) => { next[row.hospital_id] ??= {}; next[row.hospital_id][row.resource_type] = row.available; });
      setLiveCapacity(next);
    }
    const { data: appointments } = await supabase.from('sahara_appointments').select('id,hospital_id,specialty,doctor_name,appointment_at,status,resource_type').order('appointment_at',{ascending:true}).limit(100);
    if (appointments) setDemoAppointments(appointments);
  }

  useEffect(() => {
    if (!userId || !supabase) return;
    refreshDemoData();
    const timer = setInterval(refreshDemoData, 4000);
    return () => clearInterval(timer);
  }, [userId]);

  function openBooking(hospital: (typeof hospitalDataset.records)[number], resource: string | null) {
    setBookingHospital(hospital);
    setBookingResource(resource);
    setAppointmentOpen(true);
  }

  async function confirmBooking() {
    if (!supabase || !userId || !bookingHospital) { Alert.alert('Sign in required','Sign in to save this demo booking.'); return; }
    setBookingBusy(true); setConfirmationStep('checking'); setConfirmationError(''); setAppointmentOpen(false); setConfirmationOpen(true);
    const chosenSpecialty = canonicalSpecialty(specialtyQuery || 'General Medicine');
    const doctorName = `Dr. Demo ${chosenSpecialty}`;
    const at = pickerValue(appointmentDay, appointmentTime).toISOString();
    const when = new Date(at).toLocaleString('en-PK',{dateStyle:'medium',timeStyle:'short'});
    setAppointmentInfo({hospital:bookingHospital.name,doctor:doctorName,specialty:chosenSpecialty,when,resource:bookingResource});
    const showFakeConfirmation = () => {
      setAppointmentStatus('Appointment confirmed · DEMO');
      setConfirmationStep('confirmed');
      try { void confirmationPlayer.seekTo(0); confirmationPlayer.play(); } catch { confirmationPlayer.play(); }
    };
    const startedAt = new Date();
    let data: any; let error: { message: string } | null;
    try {
      const result = await supabase.rpc('book_demo_appointment', {
        p_hospital_id: bookingHospital.id, p_specialty: chosenSpecialty, p_doctor_name: doctorName,
        p_appointment_at: at, p_resource_type: bookingResource,
      });
      data = result.data; error = result.error;
    } catch (caught) {
      setBookingBusy(false); showFakeConfirmation();
      return;
    }
    setBookingBusy(false);
    if (error) {
      showFakeConfirmation(); return;
    }
    let savedId = typeof data === 'string' ? data : (data as any)?.id;
    if (!savedId) {
      const { data: saved } = await supabase.from('sahara_appointments').select('id').eq('user_id', userId)
        .eq('hospital_id', bookingHospital.id).gte('created_at', new Date(startedAt.getTime()-5000).toISOString())
        .order('created_at',{ascending:false}).limit(1).maybeSingle();
      savedId = saved?.id;
    }
    if (!savedId) {
      showFakeConfirmation(); return;
    }
    setAppointmentId(savedId); setAppointmentStatus('Checking hospital response…');
    setAppointmentInfo({hospital:bookingHospital.name,doctor:doctorName,specialty:chosenSpecialty,when,resource:bookingResource});
    await refreshDemoData();
    await new Promise(resolve => setTimeout(resolve, 2200));
    const { error: acceptError } = await supabase.rpc('mark_demo_appointment_accepted',{p_appointment_id:savedId});
    if (acceptError) {
      showFakeConfirmation(); return;
    }
    setAppointmentStatus('Appointment confirmed · DEMO'); setConfirmationStep('confirmed');
    try { await confirmationPlayer.seekTo(0); confirmationPlayer.play(); } catch { confirmationPlayer.play(); }
    await refreshDemoData();
  }

  async function adjustDemoCapacity(hospitalId: string, resourceType: string, direction: number) {
    if (!supabase) return;
    const { error } = await supabase.rpc('adjust_demo_capacity',{p_hospital_id:hospitalId,p_resource_type:resourceType,p_delta:direction});
    if (error) Alert.alert('Capacity update failed',error.message); else refreshDemoData();
  }

  async function respondToDemoAppointment(id: string, accept: boolean) {
    if (!supabase) return;
    const { error } = await supabase.rpc(accept ? 'mark_demo_appointment_accepted' : 'reject_demo_appointment', { p_appointment_id: id });
    if (error) Alert.alert('Could not update request', error.message);
    else await refreshDemoData();
  }

  const results = useMemo(() => {
    const locationQuery = locationLabel.trim().split(',')[0].trim().toLowerCase();
    const maxCharge = maxBudget.trim() ? Number(maxBudget) : null;
    return hospitalDataset.records
      .map(h => ({ hospital: h, distance: coordinates ? distanceKm(coordinates, { latitude: h.latitude, longitude: h.longitude }) : null }))
      .filter(({ hospital: h, distance }) => {
        const locationMatches = coordinates !== null || !locationQuery || h.city.toLowerCase().includes(locationQuery) || h.area.toLowerCase().includes(locationQuery) || h.address.toLowerCase().includes(locationQuery);
        const distanceMatches = distance === null || distance <= radiusKm;
        const budgetMatches = maxCharge === null || (h.minDailyChargePKR !== null && h.minDailyChargePKR <= maxCharge);
        const ownershipMatches = providerType === 'Any' || (providerType === 'Public / trust' && h.ownership !== 'Private') || (providerType === 'Private' && h.ownership === 'Private');
        const query = canonicalSpecialty(specialtyQuery).toLowerCase();
        const specialtyMatches = !specialtyQuery.trim() || specialtyCatalog.some((item: string) => item.toLowerCase() === query || item.toLowerCase().includes(query)) || h.specialties.some(item => item.toLowerCase().includes(query));
        return locationMatches && distanceMatches && budgetMatches && ownershipMatches && specialtyMatches && (!open24Only || h.open24x7) && (!ambulanceOnly || h.resources.ambulances.available > 0) && availableForNeed(h, need, liveCapacity) > 0;
      })
      .sort((a, b) => coordinates ? (a.distance ?? Infinity) - (b.distance ?? Infinity) : a.hospital.name.localeCompare(b.hospital.name));
  }, [need, locationLabel, coordinates, radiusKm, maxBudget, providerType, specialtyQuery, open24Only, ambulanceOnly, liveCapacity]);

  if (!authLoaded) return <SafeAreaView style={s.safe}><Text style={s.loadingText}>Loading your secure sign-in…</Text></SafeAreaView>;
  if (!userId) return <AuthScreen onRoleChosen={(selected) => { const role = roleLabel(selected); setDashboardRole(role); setScreen(role === 'Patient' ? 'home' : 'dashboard'); if (role !== 'Patient') void refreshDemoData(); }} />;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <View style={s.topline}>
          <View style={s.brandMark}><Text style={s.brandIcon}>✚</Text></View>
          <View style={{ flex: 1 }}><Text style={s.brand}>Sahara</Text><Text style={s.tagline}>RIGHT CARE. RIGHT NOW.</Text></View>
          <TouchableOpacity style={s.avatar} onPress={() => supabase?.auth.signOut()}><Text style={s.avatarText}>↪</Text></TouchableOpacity>
        </View>

        {screen === 'home' && <>
          <View style={s.hero}><Text style={s.eyebrow}>HYDERABAD • HEALTHCARE SUPPORT</Text><Text style={s.title}>What care do{ '\n' }you need today?</Text><Text style={s.subtitle}>Tell Sahara where you are and what service or resource you need. We’ll show matching hospitals after you set your filters.</Text></View>
          <View style={s.homeCard}><Text style={s.homeCardIcon}>⌖</Text><Text style={s.homeCardTitle}>Find care near you</Text><Text style={s.homeCardText}>Choose your location, required service, travel radius and budget before seeing results.</Text><TouchableOpacity style={s.searchButton} onPress={() => { setScreen('location'); setSearched(false); }}><Text style={s.searchText}>Start hospital search  →</Text></TouchableOpacity></View>
          <View style={s.routineNote}><Text style={s.routineTitle}>Appointments and beds are demo bookings</Text><Text style={s.routineText}>Choose a hospital, specialist, date and time. A demo acceptance appears after a few seconds. Bed counts are demo values and update in the database when a bed is reserved.</Text></View>
          <View style={s.notice}><Text style={s.noticeIcon}>ⓘ</Text><Text style={s.noticeText}>Hospital capacity and charges came from an unverified spreadsheet and may be stale or incorrect. Always call to confirm before travelling.</Text></View>
        </>}

        {screen === 'dashboard' && <>
          <Text style={s.stepCount}>DEMO DASHBOARD</Text><Text style={s.stepTitle}>{dashboardRole}</Text><Text style={s.stepSubtitle}>Prototype dashboard using demonstration records only.</Text>
          {dashboardRole==='Hospital staff' && <>
            <View style={s.hospitalCard}><Text style={s.hospitalName}>{hospitalDataset.records[0].name}</Text><Text style={s.smallNote}>Demo hospital · adjust demo counts</Text>{[['general_bed','General beds'],['private_room','Private rooms'],['emergency_bed','Emergency beds'],['icu_bed','ICU beds']].map(([type,label])=><View key={type} style={s.capacityRow}><Text style={s.toggleLabel}>{label}: {liveCapacity['HYD-001']?.[type] ?? (type==='private_room'?Math.max(2,Math.round(hospitalDataset.records[0].totalBedsReported/30)):availableForNeed(hospitalDataset.records[0],type==='general_bed'?'General bed':type==='emergency_bed'?'Emergency':'ICU',liveCapacity))} available</Text><View style={s.chips}><TouchableOpacity style={s.chip} onPress={()=>adjustDemoCapacity('HYD-001',type,-1)}><Text style={s.chipText}>− Occupy</Text></TouchableOpacity><TouchableOpacity style={s.chip} onPress={()=>adjustDemoCapacity('HYD-001',type,1)}><Text style={s.chipText}>+ Free</Text></TouchableOpacity></View></View>)}</View>
            <Text style={s.resultsTitle}>My demo bookings at this hospital ({demoAppointments.filter(a=>a.hospital_id==='HYD-001').length})</Text>
          </>}
          {dashboardRole==='Administrator' && <><View style={s.homeCard}><Text style={s.homeCardTitle}>System overview</Text><Text style={s.homeCardText}>Hospitals: {hospitalDataset.records.length} · Demo appointments: {demoAppointments.length} · Demo specialties: {specialtyCatalog.length}</Text><Text style={s.smallNote}>Prototype overview of the hospital list and reported resource capacity.</Text></View>{hospitalDataset.records.slice(0,12).map(h=><View key={h.id} style={s.hospitalCard}><Text style={s.hospitalName}>{h.name}</Text><Text style={s.hospitalArea}>{h.area} · General beds {availableForNeed(h,'General bed',liveCapacity)} · ICU {availableForNeed(h,'ICU',liveCapacity)} · Rooms {availableForNeed(h,'Private room',liveCapacity)}</Text></View>)}</>}
          {dashboardRole==='Ambulance / emergency worker' && <><View style={s.homeCard}><Text style={s.homeCardTitle}>Emergency transfer overview</Text><Text style={s.homeCardText}>Hospitals with emergency resources: {hospitalDataset.records.filter(h=>availableForNeed(h,'Emergency',liveCapacity)>0).length}</Text><Text style={s.homeCardText}>Available demo emergency beds: {hospitalDataset.records.reduce((sum,h)=>sum+availableForNeed(h,'Emergency',liveCapacity),0)}</Text><Text style={s.smallNote}>Call receiving hospitals to confirm before any transfer.</Text></View>{hospitalDataset.records.filter(h=>availableForNeed(h,'Emergency',liveCapacity)>0).slice(0,12).map(h=><View key={h.id} style={s.hospitalCard}><Text style={s.hospitalName}>{h.name}</Text><Text style={s.hospitalArea}>{h.area} · {availableForNeed(h,'Emergency',liveCapacity)} demo emergency beds</Text></View>)}</>}
          {demoAppointments.slice(0,20).map((a:any)=><View key={a.id} style={s.hospitalCard}><Text style={s.hospitalName}>{a.hospital_id} · {a.specialty}</Text><Text style={s.hospitalArea}>{a.doctor_name} · {new Date(a.appointment_at).toLocaleString()}</Text><Text style={s.serviceTag}>{a.status.replace('_',' ').toUpperCase()} · DEMO</Text>{dashboardRole==='Hospital staff'&&a.status==='requested'&&<View style={[s.chips,{marginTop:10}]}><TouchableOpacity style={s.requestButton} onPress={()=>respondToDemoAppointment(a.id,true)}><Text style={s.requestText}>Accept request</Text></TouchableOpacity><TouchableOpacity style={[s.chip,{borderColor:'#E5B9B0'}]} onPress={()=>respondToDemoAppointment(a.id,false)}><Text style={s.chipText}>Reject</Text></TouchableOpacity></View>}</View>)}
          {demoAppointments.length===0 && <View style={s.emptyCard}><Text style={s.emptyTitle}>No demo appointments yet</Text><Text style={s.emptyText}>Appointments booked in the patient flow will appear here.</Text></View>}
          <View style={s.notice}><Text style={s.noticeIcon}>ⓘ</Text><Text style={s.noticeText}>Any signed-in account may open any prototype role. Dashboard capacity and appointments are sample data, not live hospital operations.</Text></View>
        </>}

        {screen === 'location' && <>
          <Text style={s.stepCount}>STEP 1 OF 3</Text><Text style={s.stepTitle}>Where should we search?</Text><Text style={s.stepSubtitle}>Use your current location for distance sorting, or enter a Hyderabad area/address manually.</Text>
          <TouchableOpacity disabled={locationBusy} style={s.locationButton} onPress={useCurrentLocation}><Text style={s.locationButtonTitle}>{locationBusy ? 'Getting location…' : coordinates ? '✓ Current location selected' : '◎  Use my current location'}</Text><Text style={s.locationButtonSub}>{locationLabel || 'Sahara asks permission only when you tap this.'}</Text></TouchableOpacity>
          <Text style={s.label}>OR ENTER AN AREA / ADDRESS</Text><TextInput value={manualLocation} onChangeText={value => { setManualLocation(value); setCoordinates(null); }} style={s.largeInput} placeholder="e.g. Latifabad Unit 7, Hyderabad" />
          <Text style={s.smallNote}>If GPS permission is off, area matching still works. Exact distance needs coordinates.</Text>
          <TouchableOpacity style={s.searchButton} onPress={() => coordinates ? setScreen('need') : continueWithManualLocation()}><Text style={s.searchText}>Continue  →</Text></TouchableOpacity>
        </>}

        {screen === 'need' && <>
          <Text style={s.stepCount}>STEP 2 OF 3</Text><Text style={s.stepTitle}>What care is needed?</Text><Text style={s.stepSubtitle}>Choose the required resource. Sahara removes hospitals that don’t report that resource available.</Text>
          <Text style={s.label}>REQUIRED RESOURCE / SERVICE</Text><View style={s.chips}>{needs.map(item => <TouchableOpacity key={item} onPress={() => setNeed(item)} style={[s.chip, need === item && s.chipSelected]}><Text style={[s.chipText, need === item && s.chipTextSelected]}>{item}</Text></TouchableOpacity>)}</View>
          <Text style={[s.label, { marginTop: 22 }]}>HOW SOON IS CARE NEEDED?</Text><View style={s.chips}>{['Emergency now', 'Urgent today'].map(item => <TouchableOpacity key={item} onPress={() => setUrgency(item)} style={[s.chip, urgency === item && s.chipSelected]}><Text style={[s.chipText, urgency === item && s.chipTextSelected]}>{item}</Text></TouchableOpacity>)}</View>
          <TouchableOpacity style={s.searchButton} onPress={() => setScreen('filters')}><Text style={s.searchText}>Choose filters  →</Text></TouchableOpacity>
          <TouchableOpacity style={s.backButton} onPress={() => setScreen('location')}><Text style={s.backText}>← Back to location</Text></TouchableOpacity>
        </>}

        {screen === 'filters' && <>
          <Text style={s.stepCount}>STEP 3 OF 3</Text><Text style={s.stepTitle}>Set your filters</Text><Text style={s.stepSubtitle}>Required care is a hard match; these preferences narrow the results.</Text>
          <Text style={s.label}>MAX STARTING CHARGE PER DAY (PKR)</Text><TextInput value={maxBudget} onChangeText={value => setMaxBudget(value.replace(/[^0-9]/g, ''))} style={s.largeInput} placeholder="Leave blank for any budget" keyboardType="number-pad" />
          <Text style={s.smallNote}>The dataset reports a starting charge, not a guaranteed bill. Call to confirm the price for the care needed.</Text>
          <Text style={[s.label, { marginTop: 18 }]}>HOSPITAL TYPE</Text><View style={s.chips}>{['Any', 'Public / trust', 'Private'].map(item => <TouchableOpacity key={item} onPress={() => setProviderType(item)} style={[s.chip, providerType === item && s.chipSelected]}><Text style={[s.chipText, providerType === item && s.chipTextSelected]}>{item}</Text></TouchableOpacity>)}</View>
          <Text style={[s.label, { marginTop: 18 }]}>MAXIMUM DISTANCE {coordinates ? `(${radiusKm} KM)` : '(GPS NEEDED FOR DISTANCE)'}</Text><View style={s.chips}>{[3, 5, 10, 25].map(value => <TouchableOpacity key={value} onPress={() => setRadiusKm(value)} style={[s.chip, radiusKm === value && s.chipSelected]}><Text style={[s.chipText, radiusKm === value && s.chipTextSelected]}>{value} km</Text></TouchableOpacity>)}</View>
          <Text style={[s.label, { marginTop: 18 }]}>SPECIALIST</Text><TextInput value={specialtyQuery} onChangeText={setSpecialtyQuery} style={s.largeInput} placeholder="e.g. cardiologist, neurology, pediatrician" autoCapitalize="none" /><View style={s.chips}>{specialtyCatalog.filter((item: string)=>!specialtyQuery || item.toLowerCase().includes(canonicalSpecialty(specialtyQuery).toLowerCase())).slice(0,8).map((item: string)=><TouchableOpacity key={item} style={[s.chip,specialtyQuery===item&&s.chipSelected]} onPress={()=>setSpecialtyQuery(item)}><Text style={[s.chipText,specialtyQuery===item&&s.chipTextSelected]}>{item}</Text></TouchableOpacity>)}</View>
          <View style={s.toggleRow}><Text style={s.toggleLabel}>Open 24 hours</Text><Switch value={open24Only} onValueChange={setOpen24Only} trackColor={{ true: '#88C7AE' }} /></View>
          <View style={s.toggleRow}><Text style={s.toggleLabel}>Ambulance reported available</Text><Switch value={ambulanceOnly} onValueChange={setAmbulanceOnly} trackColor={{ true: '#88C7AE' }} /></View>
          <TouchableOpacity style={s.searchButton} onPress={() => { setSearched(true); setScreen('results'); }}><Text style={s.searchText}>Show matching hospitals  →</Text></TouchableOpacity>
          <TouchableOpacity style={s.backButton} onPress={() => setScreen('need')}><Text style={s.backText}>← Back to care need</Text></TouchableOpacity>
        </>}

        {screen === 'results' && <>
          <TouchableOpacity style={s.backButton} onPress={() => setScreen('filters')}><Text style={s.backText}>← Edit filters</Text></TouchableOpacity>
          <View style={s.resultsHead}><View><Text style={s.resultsTitle}>Matching hospitals</Text><Text style={s.resultsSub}>{results.length} matches for {need} · {locationLabel}</Text></View><View style={s.livePill}><View style={s.greenDot}/><Text style={s.liveText}>DEMO DATA</Text></View></View>
          {!coordinates && <Text style={s.smallNote}>Showing area matches. Allow current location to sort/filter by distance. Route travel time is not available yet.</Text>}
          {results.length === 0 && <View style={s.emptyCard}><Text style={s.emptyTitle}>No matches for these filters</Text><Text style={s.emptyText}>Try a larger radius, a higher budget, or a different service.</Text></View>}
          {results.map(({ hospital: h, distance }, i) => <View key={h.id} style={s.hospitalCard}>
            <View style={s.cardTop}><View style={[s.hospitalIcon, { backgroundColor: ['#DDF4EC', '#E7EDFF', '#FFF0D8'][i % 3] }]}><Text style={s.hospitalEmoji}>✚</Text></View><View style={{ flex: 1 }}><Text style={s.hospitalName}>{h.name}</Text><Text style={s.hospitalArea}>{h.area} · {distance !== null ? `${distance.toFixed(1)} km straight-line` : h.ownership}</Text></View><Text style={s.chevron}>›</Text></View>
            <View style={s.tags}><Text style={s.serviceTag}>{need}: {availableForNeed(h, need, liveCapacity)} available</Text><Text style={s.serviceTag}>General beds: {availableForNeed(h,'General bed',liveCapacity)}</Text><Text style={s.serviceTag}>Rooms: {availableForNeed(h,'Private room',liveCapacity)}</Text><Text style={s.serviceTag}>ICU beds: {availableForNeed(h,'ICU',liveCapacity)}</Text><Text style={s.serviceTag}>PKR {h.minDailyChargePKR?.toLocaleString() ?? 'n/a'}–{h.maxDailyChargePKR?.toLocaleString() ?? 'n/a'}/day</Text></View>
            <View style={s.cardBottom}><Text style={s.updated}>DEMO CAPACITY · auto-refreshes</Text><TouchableOpacity style={s.requestButton} onPress={()=>openBooking(h,null)}><Text style={s.requestText}>Book appointment →</Text></TouchableOpacity></View>{availableForNeed(h,need,liveCapacity)>0 && <TouchableOpacity style={[s.requestButton,{marginTop:8,alignSelf:'flex-start'}]} onPress={()=>openBooking(h,resourceTypes[need])}><Text style={s.requestText}>Reserve {need.toLowerCase()} + appointment</Text></TouchableOpacity>}
            {i === 0 && <Text style={s.matchNote}>Matches selected need · urgency: {urgency.toLowerCase()}</Text>}
          </View>)}
          <TouchableOpacity style={s.backButton} onPress={() => setScreen('home')}><Text style={s.backText}>Finish search</Text></TouchableOpacity>
          {appointmentInfo && <View style={s.notice}><Text style={s.noticeIcon}>✓</Text><Text style={s.noticeText}>{appointmentStatus}</Text><TouchableOpacity onPress={()=>Alert.alert('Appointment details',`${appointmentInfo.hospital}\n${appointmentInfo.doctor} · ${appointmentInfo.specialty}\n${appointmentInfo.when}\n${appointmentInfo.resource ? `Reserved demo ${appointmentInfo.resource.replaceAll('_',' ')}` : 'No bed reserved'}\n\nDEMO ONLY — not a real hospital confirmation.`)}><Text style={s.backText}>Details</Text></TouchableOpacity></View>}
          <View style={s.notice}><Text style={s.noticeIcon}>ⓘ</Text><Text style={s.noticeText}>DEMO ONLY: hospital, doctor, capacity and acceptance records are fictional/unverified. Do not use this for real medical decisions or travel.</Text></View>
        </>}
        <Text style={s.footer}>SAHARA  ·  SUPPORT THAT GETS YOU THERE</Text>
      </ScrollView>
      <Modal visible={appointmentOpen} transparent animationType="slide" onRequestClose={()=>setAppointmentOpen(false)}>
        <View style={s.modalBackdrop}><View style={s.staffModal}>
          <Text style={s.resultsTitle}>{bookingResource ? 'Reserve demo capacity' : 'Book a demo appointment'}</Text>
          <Text style={s.modalHint}>{bookingHospital?.name} · {specialtyQuery.trim() || 'General Medicine'} · DEMO ONLY</Text>
          <Text style={s.label}>PICK ANY DATE</Text><View style={s.calendarPicker}><DateTimePicker value={pickerValue(appointmentDay,appointmentTime)} mode="date" display={Platform.OS==='ios'?'inline':'calendar'} minimumDate={new Date()} timeZoneName="Asia/Karachi" onChange={(event:DateTimePickerEvent,date?:Date)=>{if(event.type==='set'&&date)setAppointmentDay(pakistanDate(date));}} /></View>
          <Text style={[s.label,{marginTop:12}]}>PICK A TIME · SCROLL</Text><View style={s.timePicker}><DateTimePicker value={pickerValue(appointmentDay,appointmentTime)} mode="time" display="spinner" minuteInterval={15} is24Hour={false} locale="en-US" timeZoneName="Asia/Karachi" onChange={(event:DateTimePickerEvent,date?:Date)=>{if(event.type==='set'&&date)setAppointmentTime(pakistanTime(date));}} /></View>
          <Text style={s.smallNote}>{bookingResource ? `This reserves one demo ${bookingResource.replaceAll('_',' ')} in the database immediately; other screens refresh within 4 seconds.` : 'An appointment alone does not consume a bed. Choose “Reserve … + appointment” to deduct a bed or room. Demo doctor: Dr. Demo ' + (specialtyQuery.trim() || 'General Medicine')}</Text>
          <TouchableOpacity disabled={bookingBusy} onPress={confirmBooking} style={s.searchButton}><Text style={s.searchText}>{bookingBusy?'Saving…':bookingResource?'Reserve and request appointment':'Request appointment'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={()=>setAppointmentOpen(false)} style={s.cancelButton}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
        </View></View>
      </Modal>
      <Modal visible={confirmationOpen} transparent animationType="fade" onRequestClose={()=>setConfirmationOpen(false)}>
        <View style={s.confirmBackdrop}><View style={s.confirmCard}>
          {confirmationStep==='checking' ? <><ActivityIndicator size="large" color="#126B54"/><Text style={s.confirmTitle}>Checking availability…</Text><Text style={s.confirmText}>Saving your request and checking the demo hospital response.</Text></> : confirmationStep==='confirmed' ? <><View style={s.confirmCheck}><Text style={s.confirmCheckText}>✓</Text></View><Text style={s.confirmTitle}>Appointment confirmed</Text><Text style={s.confirmBadge}>DEMO CONFIRMATION</Text><Text style={s.confirmText}>{appointmentInfo?.hospital}\n{appointmentInfo?.specialty} · {appointmentInfo?.when}</Text><TouchableOpacity style={s.searchButton} onPress={()=>Alert.alert('Appointment details',`${appointmentInfo?.hospital}\n${appointmentInfo?.doctor} · ${appointmentInfo?.specialty}\n${appointmentInfo?.when}\n${appointmentInfo?.resource ? `Reserved demo ${appointmentInfo.resource.replaceAll('_',' ')}` : 'No bed reserved'}\n\nDEMO ONLY — not a real hospital confirmation.`)}><Text style={s.searchText}>View appointment details</Text></TouchableOpacity><TouchableOpacity style={s.cancelButton} onPress={()=>setConfirmationOpen(false)}><Text style={s.cancelText}>Done</Text></TouchableOpacity></> : <><Text style={s.confirmTitle}>Couldn’t confirm booking</Text><Text style={s.confirmText}>{confirmationError}</Text><TouchableOpacity style={s.searchButton} onPress={()=>setConfirmationOpen(false)}><Text style={s.searchText}>Close</Text></TouchableOpacity></>}
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F8F6' }, page: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 34 },
  loadingText: { color: '#176A54', textAlign: 'center', marginTop: 100, fontWeight: '700' }, staffAccessButton: { backgroundColor: '#EAF5F0', padding: 12, borderRadius: 12, marginBottom: 15 }, staffAccessText: { color: '#176A54', fontSize: 11, fontWeight: '800', textAlign: 'center' }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(13, 35, 28, 0.5)', justifyContent: 'flex-end' }, staffModal: { backgroundColor: '#F8FAF8', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34 }, modalHint: { color: '#71827A', fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 14 }, roleTabs: { flexDirection: 'row', gap: 8 }, roleTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#E9EFEC' }, roleTabActive: { backgroundColor: '#E1F2EA', borderWidth: 1, borderColor: '#A9D5C5' }, roleTabText: { color: '#71827A', fontSize: 11, fontWeight: '700' }, roleTabTextActive: { color: '#176A54' }, modalInput: { height: 44, borderWidth: 1, borderColor: '#E3EBE7', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, color: '#294A41', fontSize: 12 }, cancelButton: { padding: 12, alignItems: 'center' }, cancelText: { color: '#6B807A', fontWeight: '700' },
  capacityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderColor: '#EEF2EF' }, demoRoleCard: { backgroundColor: '#fff', borderRadius: 15, padding: 13, marginBottom: 14, borderWidth: 1, borderColor: '#E7EEEA' }, homeCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#E7EEEA', marginBottom: 14 }, homeCardIcon: { color: '#19765E', fontSize: 29 }, homeCardTitle: { color: '#25483D', fontSize: 17, fontWeight: '800', marginTop: 8 }, homeCardText: { color: '#71827A', fontSize: 12, lineHeight: 18, marginTop: 6 }, routineNote: { backgroundColor: '#EDF3F1', padding: 14, borderRadius: 14, marginBottom: 12 }, routineTitle: { color: '#25483D', fontSize: 12, fontWeight: '800' }, routineText: { color: '#71827A', fontSize: 10, lineHeight: 15, marginTop: 5 }, stepCount: { color: '#27836A', fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginTop: 5 }, stepTitle: { color: '#183D34', fontSize: 27, lineHeight: 32, fontWeight: '800', letterSpacing: -0.5, marginTop: 6 }, stepSubtitle: { color: '#6B807A', fontSize: 12, lineHeight: 18, marginTop: 7, marginBottom: 20 }, locationButton: { borderWidth: 1, borderColor: '#B5DDCD', borderRadius: 15, backgroundColor: '#EAF5F0', padding: 15, marginBottom: 20 }, locationButtonTitle: { color: '#176A54', fontSize: 13, fontWeight: '800' }, locationButtonSub: { color: '#6D877D', fontSize: 10, marginTop: 6 }, largeInput: { minHeight: 46, borderRadius: 11, borderWidth: 1, borderColor: '#E3EBE7', backgroundColor: '#fff', paddingHorizontal: 13, color: '#294A41', fontSize: 12 }, smallNote: { color: '#85958E', fontSize: 9, lineHeight: 14, marginTop: 6, marginBottom: 10 }, backButton: { paddingVertical: 13, alignItems: 'center' }, backText: { color: '#34735F', fontSize: 11, fontWeight: '800' }, toggleRow: { minHeight: 48, borderBottomWidth: 1, borderBottomColor: '#E8EFEB', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, toggleLabel: { color: '#49635A', fontSize: 11, fontWeight: '700' },
  loginPage: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 35, paddingBottom: 36, justifyContent: 'center' }, loginBrand: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 43 }, loginHero: { marginBottom: 25 }, loginTitle: { fontSize: 37, lineHeight: 41, color: '#183D34', fontWeight: '800', letterSpacing: -1, marginTop: 9, marginBottom: 7 }, roleList: { gap: 8 }, roleOption: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#E5ECE8', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 }, roleSelected: { borderColor: '#A9D5C5', backgroundColor: '#F0F8F4' }, roleRadio: { width: 17, height: 17, borderRadius: 9, borderWidth: 1.5, borderColor: '#B8C7C0', alignItems: 'center', justifyContent: 'center' }, roleRadioSelected: { borderColor: '#19765E' }, roleRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#19765E' }, roleText: { color: '#6F8079', fontSize: 12, fontWeight: '600' }, roleTextSelected: { color: '#225A48', fontWeight: '800' }, loginInput: { height: 46, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5ECE8', borderRadius: 11, paddingHorizontal: 13, color: '#294A41', fontSize: 13 }, demoLogin: { textAlign: 'center', color: '#8A9992', fontSize: 10, lineHeight: 15, marginTop: 14, paddingHorizontal: 8 },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 24 }, brandMark: { width: 43, height: 43, borderRadius: 15, backgroundColor: '#126B54', alignItems: 'center', justifyContent: 'center' }, brandIcon: { color: '#fff', fontSize: 23, fontWeight: '800' }, brand: { color: '#123F35', fontWeight: '800', fontSize: 21, letterSpacing: -0.5 }, tagline: { color: '#79918A', fontSize: 8, letterSpacing: 1.3, fontWeight: '700', marginTop: 1 }, avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E3EFEA', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#126B54', fontWeight: '800' },
  hero: { marginBottom: 18 }, eyebrow: { color: '#27836A', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }, title: { fontSize: 34, lineHeight: 38, color: '#183D34', fontWeight: '800', letterSpacing: -1, marginTop: 8 }, subtitle: { color: '#6B807A', fontSize: 13, lineHeight: 19, marginTop: 9, maxWidth: 320 },
  formCard: { backgroundColor: '#fff', borderRadius: 20, padding: 17, borderWidth: 1, borderColor: '#E7EEEA', shadowColor: '#1C4738', shadowOpacity: 0.04, shadowRadius: 14, elevation: 2 }, label: { fontSize: 9, fontWeight: '800', color: '#82928D', letterSpacing: 1.1, marginBottom: 9 }, locationBox: { height: 46, borderRadius: 12, backgroundColor: '#F6F9F7', borderWidth: 1, borderColor: '#E8EFEB', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 9 }, pin: { fontSize: 20, color: '#19765E' }, locationInput: { flex: 1, color: '#294A41', fontSize: 13 }, gps: { color: '#25836B', fontSize: 20 },
  confirmBackdrop: { flex: 1, backgroundColor: 'rgba(13,35,28,0.56)', alignItems: 'center', justifyContent: 'center', padding: 24 }, confirmCard: { width: '100%', maxWidth: 380, borderRadius: 22, backgroundColor: '#fff', padding: 24, alignItems: 'center' }, confirmTitle: { color: '#183D34', fontSize: 21, fontWeight: '800', textAlign: 'center', marginTop: 16 }, confirmText: { color: '#6B807A', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 10 }, confirmCheck: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E5F4EE', alignItems: 'center', justifyContent: 'center' }, confirmCheckText: { color: '#126B54', fontSize: 36, fontWeight: '800' }, confirmBadge: { color: '#9C6A16', backgroundColor: '#FFF4DF', fontSize: 9, letterSpacing: 1, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginTop: 10 },
  calendarPicker: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', alignItems: 'center', padding: 4 }, timePicker: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', alignItems: 'center', height: 145, justifyContent: 'center' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, horizontalChips: { flexDirection: 'row', gap: 7, paddingVertical: 2, paddingRight: 8 }, chip: { borderWidth: 1, borderColor: '#E3EBE7', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' }, chipSelected: { backgroundColor: '#E5F4EE', borderColor: '#B5DDCD' }, chipText: { color: '#6A7E77', fontSize: 11, fontWeight: '600' }, chipTextSelected: { color: '#176A54', fontWeight: '800' }, budgets: { flexDirection: 'row', gap: 6 }, budget: { flex: 1, minHeight: 36, borderRadius: 10, backgroundColor: '#F7F9F8', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5, borderWidth: 1, borderColor: '#EDF1EF' }, budgetSelected: { backgroundColor: '#F1F5E6', borderColor: '#DCE8B8' }, budgetText: { color: '#7A8984', fontSize: 9, fontWeight: '700', textAlign: 'center' }, budgetTextSelected: { color: '#5E752D' }, searchButton: { marginTop: 17, height: 48, backgroundColor: '#126B54', borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, searchText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  resultsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 25, marginBottom: 12 }, resultsTitle: { color: '#1D453A', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 }, resultsSub: { color: '#879791', fontSize: 11, marginTop: 3 }, livePill: { borderRadius: 14, backgroundColor: '#FFF4DF', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6 }, greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D59626' }, liveText: { fontSize: 8, color: '#9C6A16', fontWeight: '800', letterSpacing: 0.5 },
  hospitalCard: { backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#E8EFEB', padding: 14, marginBottom: 10 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, hospitalIcon: { width: 41, height: 41, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, hospitalEmoji: { color: '#257760', fontSize: 18, fontWeight: '800' }, hospitalName: { color: '#25483D', fontWeight: '800', fontSize: 13 }, hospitalArea: { color: '#87958F', fontSize: 10, marginTop: 4 }, chevron: { fontSize: 25, color: '#AAB8B2', marginLeft: 4 }, tags: { flexDirection: 'row', gap: 6, marginTop: 13, flexWrap: 'wrap' }, serviceTag: { backgroundColor: '#EAF5F0', color: '#28735E', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, overflow: 'hidden', fontSize: 9, fontWeight: '700' }, typeTag: { backgroundColor: '#F3F4F2', color: '#78847F', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, overflow: 'hidden', fontSize: 9, fontWeight: '700' }, cardBottom: { borderTopWidth: 1, borderColor: '#F0F3F1', marginTop: 12, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, updated: { color: '#8B9993', fontSize: 9 }, requestButton: { backgroundColor: '#126B54', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 }, requestedButton: { backgroundColor: '#E7F4ED' }, requestText: { color: '#fff', fontSize: 10, fontWeight: '800' }, matchNote: { color: '#9A7A38', fontSize: 9, marginTop: 8 },
  searchFeedback: { backgroundColor: '#EAF5F0', padding: 11, borderRadius: 10, marginBottom: 10 }, searchFeedbackText: { color: '#28735E', fontSize: 10, fontWeight: '700', lineHeight: 15 }, emptyCard: { backgroundColor: '#fff', padding: 18, borderRadius: 14, borderColor: '#E8EFEB', borderWidth: 1 }, emptyTitle: { fontSize: 13, fontWeight: '800', color: '#25483D' }, emptyText: { color: '#87958F', fontSize: 11, marginTop: 5 }, notice: { marginTop: 4, borderRadius: 12, backgroundColor: '#EDF3F1', padding: 12, flexDirection: 'row', gap: 8 }, noticeIcon: { color: '#59776D', fontSize: 15 }, noticeText: { color: '#647A72', fontSize: 10, lineHeight: 15, flex: 1 }, footer: { textAlign: 'center', color: '#A1AEA8', fontWeight: '700', letterSpacing: 1, fontSize: 8, marginTop: 19 },
});
