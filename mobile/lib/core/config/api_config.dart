class ApiConfig {
  // Default to Android Emulator host IP (10.0.2.2).
  // Can be adjusted at runtime to 'localhost' or computer LAN IP (e.g. 192.168.1.15:8000).
  static String baseUrl = 'http://10.0.2.2:8000';

  static const String apiV1Prefix = '/api/v1';

  static String get incidentsUrl => '$baseUrl$apiV1Prefix/incidents';

  static String incidentDetailUrl(String id) => '$incidentsUrl/$id';

  static String incidentPhotosUploadUrl(String id) => '$incidentsUrl/$id/photos';

  static String resolvePhotoUrl(String photoPath) {
    if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
      return photoPath;
    }
    // Relative photo path like /api/v1/incidents/photos/xxxx.jpg
    final cleanPath = photoPath.startsWith('/') ? photoPath : '/$photoPath';
    return '$baseUrl$cleanPath';
  }

  // Pre-configured environments for easy switching in demo mode
  static const Map<String, String> presetEnvironments = {
    'Android Emulator (10.0.2.2:8000)': 'http://10.0.2.2:8000',
    'Localhost (Desktop/Web 8000)': 'http://localhost:8000',
    'Local Loopback (127.0.0.1:8000)': 'http://127.0.0.1:8000',
  };
}
