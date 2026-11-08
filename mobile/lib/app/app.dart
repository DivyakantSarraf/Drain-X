import 'package:flutter/material.dart';
import '../core/theme/app_theme.dart';
import '../features/auth/welcome_screen.dart';
import '../features/auth/citizen_login_screen.dart';
import '../features/auth/municipal_login_screen.dart';
import 'routes.dart';

class DrainXMobileApp extends StatelessWidget {
  const DrainXMobileApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DRAIN-X Mobile',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      initialRoute: AppRoutes.welcome,
      routes: {
        AppRoutes.welcome: (_) => const WelcomeScreen(),
        AppRoutes.citizenLogin: (_) => const CitizenLoginScreen(),
        AppRoutes.municipalLogin: (_) => const MunicipalLoginScreen(),
      },
    );
  }
}
