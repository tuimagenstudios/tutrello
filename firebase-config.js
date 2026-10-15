/* Datos públicos del proyecto de Firebase (Configuración del proyecto → Tus apps → Web).
   No son secretos: la seguridad la dan las reglas de Firestore (firestore.rules). */
window.TUTRELLO_FIREBASE = {
  apiKey: 'AIzaSyBo3it-7p7FQ7jNA68CVqWFbft79lHLKuA',
  authDomain: 'tutrello.firebaseapp.com',
  projectId: 'tutrello',
  storageBucket: 'tutrello.firebasestorage.app',
  messagingSenderId: '998746029285',
  appId: '1:998746029285:web:8e3c6f79545a24e8c5680c'
};
/* Administradora de la lista de acceso. Debe coincidir con isAdmin() en firestore.rules. */
window.TUTRELLO_ADMIN = 'tuimagenstudio@gmail.com';
