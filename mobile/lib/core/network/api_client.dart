import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../config/api_config.dart';
import '../../models/incident.dart';

class PhotoUploadItem {
  final String filename;
  final Uint8List bytes;
  final String mimeType;

  PhotoUploadItem({
    required this.filename,
    required this.bytes,
    this.mimeType = 'image/jpeg',
  });
}

class ApiException implements Exception {
  final int statusCode;
  final String message;

  ApiException(this.statusCode, this.message);

  @override
  String toString() => 'ApiException ($statusCode): $message';
}

class ApiClient {
  final http.Client _httpClient;

  ApiClient({http.Client? httpClient}) : _httpClient = httpClient ?? http.Client();

  // 1. GET /api/v1/incidents
  Future<List<Incident>> getIncidents({
    String? status,
    String? category,
    String? severity,
    String? source,
  }) async {
    final queryParams = <String, String>{};
    if (status != null && status != 'ALL') queryParams['status'] = status;
    if (category != null && category != 'ALL') queryParams['category'] = category;
    if (severity != null && severity != 'ALL') queryParams['severity'] = severity;
    if (source != null && source != 'ALL') queryParams['source'] = source;

    final uri = Uri.parse(ApiConfig.incidentsUrl).replace(queryParameters: queryParams.isEmpty ? null : queryParams);

    try {
      final response = await _httpClient.get(uri).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body) as List<dynamic>;
        return data.map((json) => Incident.fromJson(json as Map<String, dynamic>)).toList();
      } else {
        throw ApiException(response.statusCode, 'Failed to fetch incidents: ${response.body}');
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(0, 'Unable to connect to DRAIN-X backend at ${ApiConfig.baseUrl}. Please check network connection.');
    }
  }

  // 2. GET /api/v1/incidents/{id}
  Future<Incident> getIncident(String id) async {
    final uri = Uri.parse(ApiConfig.incidentDetailUrl(id));
    try {
      final response = await _httpClient.get(uri).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body) as Map<String, dynamic>;
        return Incident.fromJson(data);
      } else if (response.statusCode == 404) {
        throw ApiException(404, 'Incident with ID $id not found.');
      } else {
        throw ApiException(response.statusCode, 'Failed to retrieve incident: ${response.body}');
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(0, 'Connection error: ${e.toString()}');
    }
  }

  // 3. POST /api/v1/incidents
  Future<Incident> createIncident({
    required String category,
    required String description,
    required double latitude,
    required double longitude,
    required String severity,
    String source = 'CITIZEN',
    String? reporterName,
  }) async {
    final uri = Uri.parse(ApiConfig.incidentsUrl);
    final payload = {
      'category': category,
      'description': description,
      'latitude': latitude,
      'longitude': longitude,
      'severity': severity,
      'source': source,
      'reporter_name': reporterName ?? 'Citizen Anonymous',
    };

    try {
      final response = await _httpClient
          .post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 201) {
        final Map<String, dynamic> data = jsonDecode(response.body) as Map<String, dynamic>;
        return Incident.fromJson(data);
      } else {
        throw ApiException(response.statusCode, 'Failed to create report: ${response.body}');
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(0, 'Connection error: ${e.toString()}');
    }
  }

  // 4. POST /api/v1/incidents/{id}/photos
  Future<Incident> uploadIncidentPhotos(String incidentId, List<PhotoUploadItem> photos) async {
    if (photos.isEmpty) {
      return getIncident(incidentId);
    }

    final uri = Uri.parse(ApiConfig.incidentPhotosUploadUrl(incidentId));
    final request = http.MultipartRequest('POST', uri);

    for (final photo in photos) {
      final mediaParts = photo.mimeType.split('/');
      final mediaType = MediaType(mediaParts[0], mediaParts.length > 1 ? mediaParts[1] : 'jpeg');

      final multipartFile = http.MultipartFile.fromBytes(
        'files',
        photo.bytes,
        filename: photo.filename,
        contentType: mediaType,
      );
      request.files.add(multipartFile);
    }

    try {
      final streamedResponse = await request.send().timeout(const Duration(seconds: 25));
      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body) as Map<String, dynamic>;
        return Incident.fromJson(data);
      } else {
        throw ApiException(response.statusCode, 'Photo upload error: ${response.body}');
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(0, 'Failed to upload photo evidence: ${e.toString()}');
    }
  }

  // 5. PATCH /api/v1/incidents/{id}
  Future<Incident> updateIncident(
    String id, {
    String? status,
    String? assignedTo,
    String? municipalNotes,
  }) async {
    final uri = Uri.parse(ApiConfig.incidentDetailUrl(id));
    final payload = <String, dynamic>{};

    if (status != null) payload['status'] = status;
    if (assignedTo != null) payload['assigned_to'] = assignedTo;
    if (municipalNotes != null) payload['municipal_notes'] = municipalNotes;

    try {
      final response = await _httpClient
          .patch(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body) as Map<String, dynamic>;
        return Incident.fromJson(data);
      } else {
        throw ApiException(response.statusCode, 'Failed to update ticket: ${response.body}');
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(0, 'Failed to update incident: ${e.toString()}');
    }
  }
}
