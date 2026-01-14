package com.midnightcuriosity.data

object CurriculumData {
    fun getTopicsForGrade(grade: String): List<String> {
        return when (grade) {
            "Grade 10" -> listOf("Real Numbers", "Polynomials", "Linear Equations", "Quadratic Eqs", "Arithmetic Prog")
            "Grade 11" -> listOf("Sets", "Relations", "Trigonometry", "Complex Numbers", "Inequalities")
            "Grade 12" -> listOf("Relations & Func", "Inverse Trig", "Matrices", "Determinants", "Continuity")
            else -> listOf("Numbers", "Variables", "Equations", "Geometry", "Statistics") // Default fallback
        }
    }
}
