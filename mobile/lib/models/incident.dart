class Incident {
  final String id;
  final String category;
  final String description;
  final double latitude;
  final double longitude;
  final String severity;
  final String status;
  final String source;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? assignedTo;
  final String? municipalNotes;
  final String? reporterName;
  final List<String> photos;

  Incident({
    required this.id,
    required this.category,
    required this.description,
    required this.latitude,
    required this.longitude,
    required this.severity,
    required this.status,
    required this.source,
    required this.createdAt,
    required this.updatedAt,
    this.assignedTo,
    this.municipalNotes,
    this.reporterName,
    this.photos = const [],
  });

  factory Incident.fromJson(Map<String, dynamic> json) {
    return Incident(
      id: json['id'] as String,
      category: json['category'] as String,
      description: json['description'] as String,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      severity: json['severity'] as String,
      status: json['status'] as String,
      source: json['source'] as String? ?? 'CITIZEN',
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
      assignedTo: json['assigned_to'] as String?,
      municipalNotes: json['municipal_notes'] as String?,
      reporterName: json['reporter_name'] as String?,
      photos: (json['photos'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'category': category,
      'description': description,
      'latitude': latitude,
      'longitude': longitude,
      'severity': severity,
      'status': status,
      'source': source,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
      'assigned_to': assignedTo,
      'municipal_notes': municipalNotes,
      'reporter_name': reporterName,
      'photos': photos,
    };
  }
}

class IncidentConstants {
  static const List<String> categories = [
    'DRAIN_BLOCKAGE',
    'DRAIN_OVERFLOW',
    'WATERLOGGING',
    'FLOODING',
    'MANHOLE_DAMAGE',
    'INFRASTRUCTURE_DAMAGE',
    'OTHER',
  ];

  static const List<String> severities = [
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL',
  ];

  static const List<String> statuses = [
    'REPORTED',
    'VERIFIED',
    'ASSIGNED',
    'INVESTIGATING',
    'RESOLVED',
    'REJECTED',
  ];

  static const List<String> fieldTeams = [
    'Team Alpha — St. Inez Drainage Crew',
    'Team Beta — Patto Rapid Response',
    'Team Gamma — Fontainhas Heritage Maintenance',
    'Team Delta — Miramar Outfall Sluice Unit',
  ];

  static const Map<String, List<String>> validStatusTransitions = {
    'REPORTED': ['VERIFIED', 'ASSIGNED', 'INVESTIGATING', 'REJECTED'],
    'VERIFIED': ['ASSIGNED', 'INVESTIGATING', 'REJECTED'],
    'ASSIGNED': ['INVESTIGATING', 'RESOLVED', 'REJECTED'],
    'INVESTIGATING': ['RESOLVED', 'REJECTED'],
    'RESOLVED': ['INVESTIGATING'],
    'REJECTED': ['REPORTED'],
  };

  static List<String> getAllowedNextStatuses(String currentStatus) {
    final next = validStatusTransitions[currentStatus] ?? [];
    return [currentStatus, ...next];
  }

  static String formatCategory(String category) {
    return category.replaceAll('_', ' ');
  }
}
