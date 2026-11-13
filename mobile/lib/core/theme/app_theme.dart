import 'package:flutter/material.dart';

class AppTheme {
  // Brand Palette: Deep Navy, Midnight Cyan, Bright Teal, Pure White
  static const Color primaryNavy = Color(0xFF0F172A);
  static const Color secondaryNavy = Color(0xFF1E293B);
  static const Color accentCyan = Color(0xFF06B6D4);
  static const Color accentTeal = Color(0xFF0D9488);
  static const Color surfaceLight = Color(0xFFF8FAFC);
  static const Color cardBorder = Color(0xFFCBD5E1);

  // Status & Severity Colors
  static const Color severityCritical = Color(0xFFDC2626);
  static const Color severityHigh = Color(0xFFEA580C);
  static const Color severityMedium = Color(0xFFD97706);
  static const Color severityLow = Color(0xFF16A34A);

  static const Color statusReported = Color(0xFF2563EB);
  static const Color statusVerified = Color(0xFF7C3AED);
  static const Color statusAssigned = Color(0xFF4F46E5);
  static const Color statusInvestigating = Color(0xFFCA8A04);
  static const Color statusResolved = Color(0xFF16A34A);
  static const Color statusRejected = Color(0xFF64748B);

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      primaryColor: primaryNavy,
      scaffoldBackgroundColor: surfaceLight,
      colorScheme: ColorScheme.fromSeed(
        seedColor: accentCyan,
        primary: primaryNavy,
        secondary: accentCyan,
        surface: Colors.white,
      ),
      fontFamily: 'Roboto',
      appBarTheme: const AppBarTheme(
        backgroundColor: primaryNavy,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.bold,
          letterSpacing: 0.5,
        ),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 1.5,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: cardBorder, width: 0.8),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: accentCyan,
          foregroundColor: Colors.white,
          elevation: 2,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.5,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: cardBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: cardBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: accentCyan, width: 2),
        ),
        labelStyle: const TextStyle(color: Color(0xFF64748B)),
      ),
    );
  }
}
