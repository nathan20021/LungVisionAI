import React from "react";
import { FiMail, FiPhone } from "react-icons/fi";
import { Link } from "react-router-dom";
import { FaRegUser } from "react-icons/fa";

function PatientInfo({ patient }) {
  return (
    <div className="bg-white rounded-lg shadow-xs">
      {/* Patient Info Section */}
      <div className="p-6">
        <div className="flex items-center gap-4">
          {
            // Patient Avatar
            patient?.avatar ? (
              <img
                src={patient.avatar}
                alt="Patient"
                className="w-12 h-12 rounded-full"
              />
            ) : (
              <div className="w-12 bg-gray-600 aspect-square flex justify-center items-center rounded-full">
                <FaRegUser className="w-full object-cover text-gray-200" />
              </div>
            )
          }

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{patient.name}</h1>
            </div>
            <div className="text-gray-600 text-sm">
              <span>{`${patient.gender} · Age ${patient.age}`}</span>
              <br />
            </div>
          </div>
          <div className="pl-5 ml-5 bl-2 border-gray-200 border-l text-right text-sm text-gray-600">
            <div className="flex gap-2 items-center">
              <FiMail />
              <Link to={`mailto:${patient.email}`}>
                <p className=" cursor-pointer text-primary hover:text-[#53859b] transition-colors duration-200 ease-in-out underline">
                  {patient.email}
                </p>
              </Link>
            </div>
            <div className="flex gap-2 items-center">
              <FiPhone />
              <p>N/A</p>
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal divider below patient info */}
      <div className="border-b border-gray-200"></div>
    </div>
  );
}

export default PatientInfo;
