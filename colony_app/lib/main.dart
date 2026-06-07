import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'firebase_options.dart';
import 'presentation/screens/rastreo_screen.dart';
import 'presentation/screens/agente_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  print("INICIANDO FIREBASE...");
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    print(" FIREBASE INICIALIZADO CORRECTAMENTE.");

    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      print(
        " NOTIFICACIÓN RECIBIDA EN PRIMER PLANO: ${message.notification?.title}",
      );
    });
  } catch (e) {
    print(" ERROR AL INICIALIZAR FIREBASE: $e");
  }
  runApp(const ColonyApp());
}

class ColonyApp extends StatelessWidget {
  const ColonyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Colony',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1D4ED8)),
        textTheme: GoogleFonts.interTextTheme(),
      ),
      home: const _HomeScreen(),
    );
  }
}

class _HomeScreen extends StatelessWidget {
  const _HomeScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: const RastreoScreen(),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AgenteScreen()),
        ),
        backgroundColor: const Color(0xFF1D4ED8),
        icon: const Icon(Icons.smart_toy_outlined, color: Colors.white),
        label: Text(
          'Iniciar Trámite',
          style: GoogleFonts.inter(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}
